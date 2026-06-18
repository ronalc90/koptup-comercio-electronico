import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantConfig } from '@/lib/tenantConfigServer';
import type { TenantConfig } from '@/lib/tenants.config';
import type { SupabaseClient } from '@supabase/supabase-js';

async function resolveApiKey(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'openai_api_key')
      .maybeSingle();
    if (!error && data?.value?.trim()) return data.value.trim();
  } catch { /* fall through */ }
  return process.env.OPENAI_API_KEY ?? null;
}

/**
 * Construye el prompt de sistema especializado por tenant. La identidad, el
 * dominio del negocio y las categorías válidas vienen de la config del tenant
 * (no se hardcodean Meraki/pantuflas). El esquema JSON de salida y la forma de
 * la respuesta se mantienen idénticos para cualquier tenant.
 */
function buildSystemPrompt(cfg: TenantConfig): string {
  const categorias = cfg.categories.join(', ');
  return `${cfg.ai.systemPrompt}

${cfg.ai.captureHints}

Tu trabajo es registrar productos en el inventario a partir del texto o voz del usuario.

Categorías válidas: ${categorias}

Extrae:
- model: nombre/modelo del producto
- category: una de las categorías válidas listadas arriba
- product_id: código interno del producto si se menciona o se puede inferir
- color: color mencionado
- size: talla/medida mencionada (si aplica)
- quantity: cantidad
- basket_location: canasta/caja/ubicación donde se dejó (C001, C002, etc.)
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
- Si no dice ubicación/canasta, preguntar
- Si no dice cantidad, asumir 1
- La categoría debe ser una de las categorías válidas listadas arriba
- Puede registrar múltiples items en un solo mensaje`;
}

export async function POST(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const { ctx, client } = scoped;

  const apiKey = await resolveApiKey(client);
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada. Ve a Configuración.' }, { status: 500 });
  }

  try {
    const { message, context } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    const cfg = await loadTenantConfig(ctx.tenantId, ctx.tenantSlug);
    const systemPrompt = buildSystemPrompt(cfg);

    const openai = new OpenAI({ apiKey });
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
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
    console.error('AI parse-inventory error:', msg);
    return NextResponse.json({ error: 'No se pudo procesar el inventario' }, { status: 500 });
  }
}
