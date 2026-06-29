import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantConfig } from '@/lib/tenantConfigServer';

async function resolveApiKey(client: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('settings')
      .select('value')
      .eq('key', 'openai_api_key')
      .maybeSingle();
    if (!error && data?.value?.trim()) return data.value.trim();
  } catch { /* fall through */ }
  return process.env.OPENAI_API_KEY ?? null;
}

export async function POST(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const { ctx, client } = scoped;
  const apiKey = await resolveApiKey(client);
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 });
  }

  try {
    const { image, context } = await request.json();

    if (typeof image !== 'string' || !image) {
      return NextResponse.json({ error: 'No se envió imagen' }, { status: 400 });
    }
    // Solo data-uri de imagen permitida (jpeg/png/webp) + límite de tamaño.
    if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(image)) {
      return NextResponse.json({ error: 'Tipo de imagen no permitido (jpeg/png/webp)' }, { status: 415 });
    }
    const sizeBytes = Math.floor(((image.split(',')[1] || '').length) * 0.75);
    if (sizeBytes > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Imagen muy grande (máx 5 MB)' }, { status: 413 });
    }

    const cfg = await loadTenantConfig(ctx.tenantId, ctx.tenantSlug);
    const categoryList = cfg.categories.join(', ');

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Eres un asistente de "${cfg.name}", un negocio colombiano de ${cfg.ai.domain}.

Analiza la foto del producto y genera:
1. Un nombre descriptivo corto
2. La categoría: debe ser EXACTAMENTE una de estas: ${categoryList}. Elige la más cercana al producto.
3. Un código de referencia sugerido (siglas cortas en mayúsculas derivadas de la categoría)
4. Colores que ves
5. Talla estimada si aplica
6. Descripción corta para inventario

${context ? `Contexto adicional del usuario: ${context}` : ''}

Responde SIEMPRE en JSON:
{
  "name": "string",
  "category": "string (una de: ${categoryList})",
  "code": "string (ref code)",
  "colors": ["string"],
  "size": "string o null",
  "description": "string",
  "suggested_cost": number (sugiere un costo estimado razonable en COP según el producto)
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

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      return NextResponse.json({ error: 'Sin respuesta de la IA' }, { status: 500 });
    }
    if (choice?.finish_reason === 'length') {
      return NextResponse.json({ error: 'La respuesta de la IA quedó incompleta.' }, { status: 422 });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'No se pudo interpretar la respuesta de la IA' }, { status: 422 });
    }
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('Product analyze error:', msg);
    // No filtramos el error interno al cliente.
    return NextResponse.json({ error: 'No se pudo analizar la imagen' }, { status: 500 });
  }
}
