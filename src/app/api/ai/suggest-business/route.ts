import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { rateLimit } from '@/lib/rateLimit';
import { INDUSTRY_KEYS, INDUSTRY_PRESETS, isKnownIndustry, sanitizeCategories } from '@/lib/registration';

export const dynamic = 'force-dynamic';

// Sugerencia de IA para PRECARGAR el formulario de registro (público). NO es
// obligatorio: si no hay API key responde { available:false } (200), nunca 500,
// y el front cae a los presets por industria. Rate limit estricto por IP.
const MAX = 5;
const WINDOW_MS = 60 * 1000;

function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  return request.headers.get('x-real-ip')?.trim() || xff?.split(',').pop()?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ available: false });

  const rl = rateLimit(`suggest:${clientIp(request)}`, MAX, WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: `Espera ${rl.retryAfterSec}s` }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 200) : '';
  if (!description) return NextResponse.json({ error: 'Describe tu negocio' }, { status: 400 });

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Eres un asistente que clasifica negocios colombianos para precargar un formulario de registro. `
            + `Devuelve SOLO un JSON: {"industry": <una de: ${INDUSTRY_KEYS.join(', ')}>, "categories": [4 a 6 categorías de producto cortas], "aiDomain": "<dominio del negocio en pocas palabras>"}. `
            + `Si no encaja en ninguna industria, usa "otro".`,
        },
        { role: 'user', content: description },
      ],
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ available: false });

    const parsed = JSON.parse(content);
    const industry = isKnownIndustry(parsed.industry) ? parsed.industry : 'otro';
    const categories = sanitizeCategories(parsed.categories);
    return NextResponse.json({
      available: true,
      industry,
      categories: categories.length ? categories : INDUSTRY_PRESETS[industry].categories,
      aiDomain: typeof parsed.aiDomain === 'string' ? parsed.aiDomain.slice(0, 60) : '',
    });
  } catch (e) {
    console.error('suggest-business:', e instanceof Error ? e.message : e);
    // Degradación: que el registro siga sin IA.
    return NextResponse.json({ available: false });
  }
}
