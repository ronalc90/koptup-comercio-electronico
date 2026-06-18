import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantConfig } from '@/lib/tenantConfigServer';
import type { TenantConfig } from '@/lib/tenants.config';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Construye la instrucción de sistema para el extractor de pedidos a partir de
 * la config EFECTIVA del tenant. La identidad del negocio, su dominio, las
 * categorías válidas y las pistas de captura son específicas del tenant; las
 * reglas de extracción y el esquema JSON de salida son genéricos.
 */
function buildSystemPrompt(cfg: TenantConfig): string {
  return `${cfg.ai.systemPrompt}

Dominio del negocio: ${cfg.ai.domain}.
Categorías válidas: ${cfg.categories.join(', ')}.

Pistas de captura para este negocio: ${cfg.ai.captureHints}

Tu trabajo es extraer la información de pedidos del texto que te envían. Los pedidos suelen llegar por WhatsApp con este formato:
- Nombre del cliente
- Teléfono(s)
- Dirección
- Complemento (barrio, conjunto, edificio, etc.)
- Detalle del producto (tipo, talla, color)
- Valor a cobrar

SIEMPRE responde con un JSON válido con esta estructura:
{
  "parsed": true,
  "order": {
    "client_name": "string",
    "phone": "string",
    "address": "string",
    "complement": "string",
    "detail": "string",
    "value_to_collect": number,
    "city": "string (si se menciona, si no 'Bogotá')",
    "product_ref": "string (código o referencia del producto si se reconoce, o vacío)",
    "comment": "string (instrucciones especiales como 'llamar cliente', mensajes personalizados, etc.)"
  },
  "message": "string (resumen amigable de lo que entendiste)"
}

Si el texto NO es un pedido o falta información crítica, responde:
{
  "parsed": false,
  "message": "string (explica qué falta o qué necesitas)",
  "partial": { ...lo que pudiste extraer... }
}

Reglas:
- El valor siempre es un número sin puntos ni comas (ej: 60000, no $60.000)
- Si el teléfono viene sin separadores, mantenlo así
- Clasifica el producto dentro de las categorías válidas cuando sea posible
- Si mencionan "talla" seguido de número, inclúyelo en el detalle
- Si hay instrucciones como "llamar cliente" o mensajes especiales, van en comment
- La ciudad por defecto es Bogotá si no se especifica`;
}

async function resolveApiKey(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'openai_api_key')
      .maybeSingle();

    if (!error && data?.value?.trim()) {
      return data.value.trim();
    }
  } catch {
    // fall through to env var
  }
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
    return NextResponse.json(
      { error: 'API key de OpenAI no configurada. Ve a Configuración.' },
      { status: 500 }
    );
  }

  try {
    const { message, context } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    const cfg = await loadTenantConfig(ctx.tenantId, ctx.tenantSlug);
    const openai = new OpenAI({ apiKey });

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(cfg) },
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
    if (!content) {
      return NextResponse.json({ error: 'Sin respuesta de la IA' }, { status: 500 });
    }

    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('AI parse error:', message);
    return NextResponse.json({ error: 'No se pudo procesar el pedido' }, { status: 500 });
  }
}
