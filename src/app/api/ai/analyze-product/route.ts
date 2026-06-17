import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { getSession } from '@/lib/auth';

async function resolveApiKey(): Promise<string | null> {
  try {
    const scoped = await getRequestScopedClient();
    if (!scoped) return process.env.OPENAI_API_KEY ?? null;
    const supabase = scoped.client;
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'openai_api_key')
      .maybeSingle();
    if (!error && data?.value?.trim()) return data.value.trim();
  } catch { /* fall through */ }
  return process.env.OPENAI_API_KEY ?? null;
}

export async function POST(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 });
  }

  try {
    const { image, context } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'No se envió imagen' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un asistente de "Tu Tienda Meraki", un negocio colombiano de pantuflas, maxisacos y accesorios.

Analiza la foto del producto y genera:
1. Un nombre descriptivo corto (ej: "Pantuflas Vaquita Blanca", "Maxisaco Cool Pandita")
2. La categoría (Pantuflas, Maxisaco, Pocillo, Bolso, Accesorio, Otro)
3. Un código de referencia sugerido (ej: PANT para pantuflas, MAX para maxisaco, POC para pocillo, BOL para bolso, ACC para accesorio)
4. Colores que ves
5. Talla estimada si aplica
6. Descripción corta para inventario

${context ? `Contexto adicional del usuario: ${context}` : ''}

Responde SIEMPRE en JSON:
{
  "name": "string",
  "category": "string",
  "code": "string (ref code)",
  "colors": ["string"],
  "size": "string o null",
  "description": "string",
  "suggested_cost": number (precio sugerido en COP basado en el tipo de producto, pantuflas ~25000-65000, maxisacos ~80000-130000, pocillos ~15000-25000)
}`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: context || 'Analiza este producto para inventario' },
            { type: 'image_url', image_url: { url: image, detail: 'low' } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Sin respuesta de la IA' }, { status: 500 });
    }

    return NextResponse.json(JSON.parse(content));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Product analyze error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
