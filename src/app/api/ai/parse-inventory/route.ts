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

const SYSTEM_PROMPT = `Eres un asistente de inventario de "Tu Tienda Meraki", un negocio colombiano de pantuflas, maxisacos y accesorios.

Tu trabajo es registrar productos en el inventario a partir del texto o voz del usuario. El usuario te dirá cosas como:
- "Tengo 10 pantuflas vaquita blanca talla 38 las dejé en la canasta C015"
- "Llegaron 5 maxisacos cool pandita, están en C003"
- "3 pares de stitch rosado talla 36 en canasta C020"
- "Puse 8 clásicas miel talla 40 en la caja C007"

Extrae:
- model: nombre/modelo del producto (Vaca, Stitch, Clásica, Pandita, etc.)
- category: Pantuflas, Maxisaco, Pocillo, Bolso, Accesorio
- product_id: código (PA001=Vaca, PA002=Vaca peluda, PANT=pantuflas genérico, MAX=maxisaco, etc.)
- color: color mencionado
- size: talla mencionada (formato "36-37", "38-39", "40-41")
- quantity: cantidad
- basket_location: canasta/caja donde lo dejó (C001, C002, etc.)
- type: Adulto por defecto, Niño si lo menciona
- observations: notas adicionales

Responde SIEMPRE en JSON:
{
  "parsed": true,
  "items": [{
    "model": "string",
    "category": "string",
    "product_id": "string",
    "color": "string",
    "size": "string o vacío",
    "quantity": number,
    "basket_location": "string",
    "type": "Adulto",
    "observations": "string"
  }],
  "message": "resumen amigable"
}

Si falta información:
{
  "parsed": false,
  "message": "explicación de qué falta",
  "partial": { ...lo que pudiste extraer }
}

Reglas:
- Si no dice canasta, preguntar
- Si no dice cantidad, asumir 1
- Talla: convertir "38" a "38-39", "36" a "36-37", "40" a "40-41"
- Puede registrar múltiples items en un solo mensaje`;

export async function POST(request: NextRequest) {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada. Ve a Configuración.' }, { status: 500 });
  }

  try {
    const { message, context } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (context && Array.isArray(context)) {
      for (const msg of context.slice(-6)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'Sin respuesta' }, { status: 500 });

    return NextResponse.json(JSON.parse(content));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
