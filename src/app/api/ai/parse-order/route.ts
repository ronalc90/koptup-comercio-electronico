import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantConfig } from '@/lib/tenantConfigServer';
import type { TenantConfig } from '@/lib/tenants.config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCopAmount } from '@/lib/utils';
import {
  buildCatalogIndex,
  decideClarification,
  composeDetail,
  type CatalogIndex,
  type ParsedProduct,
  type ParsedOrderCore,
} from '@/lib/orders/parseClarify';
import type { ParsedOrder } from '@/lib/types';

/**
 * Resumen compacto del catálogo en stock para que el modelo razone contra las
 * variantes REALES y no las invente. La validación dura igual ocurre server-side
 * en decideClarification; esto solo ayuda a que el LLM pregunte mejor.
 */
function buildCatalogSummary(idx: CatalogIndex): string {
  const lines: string[] = [];
  let n = 0;
  for (const [model, v] of idx.byModel) {
    if (n++ >= 50) { lines.push('…(y más productos en inventario)'); break; }
    const parts: string[] = [];
    if (v.colors.length) parts.push(`colores: ${v.colors.slice(0, 12).join(', ')}`);
    if (v.sizes.length) parts.push(`tallas: ${v.sizes.slice(0, 12).join(', ')}`);
    lines.push(`- ${model}${parts.length ? ` (${parts.join('; ')})` : ''}`);
  }
  return lines.length ? lines.join('\n') : '(inventario no disponible; valida con el usuario si dudas)';
}

/**
 * Instrucción de sistema del extractor de pedidos. La identidad/dominio/categorías
 * son del tenant; las reglas de razonamiento, el catálogo en stock y el esquema de
 * salida estructurado (status / order / products / questions) son genéricos.
 */
function buildSystemPrompt(cfg: TenantConfig, catalogSummary: string): string {
  return `${cfg.ai.systemPrompt}

Dominio del negocio: ${cfg.ai.domain}.
Categorías válidas: ${cfg.categories.join(', ')}.
Pistas de captura para este negocio: ${cfg.ai.captureHints}

CATÁLOGO EN STOCK (úsalo para validar; NO inventes variantes que no aparezcan aquí):
${catalogSummary}

Tu trabajo es extraer pedidos de texto que suele llegar por WhatsApp (con saludos, emojis, "porfa", audios transcritos y ruido). RAZONA EN ESTE ORDEN antes de responder:
1) EXTRAE: nombre, teléfono, dirección, complemento (barrio/conjunto), valor a cobrar y las LÍNEAS de producto. Ignora el ruido (saludos, emojis, gracias).
2) SEGMENTA productos: nombres distintos ⇒ líneas distintas ("dos pantuflas y un bolso" ⇒ pantufla x2 + bolso x1). Un mismo nombre con cantidad ⇒ una línea con quantity ("dos pantuflas rojas" ⇒ pantufla rojo x2). Mismo modelo con atributos distintos ⇒ una línea por combinación ("2 clásicas 38 miel y 1 talla 40 negra" ⇒ dos líneas).
3) CUENTA unidades: si el número de unidades supera los atributos dados (ej. "3 pantuflas, 2 rojas y 1") NO completes; deja la línea sin ese atributo y prepárate a preguntar.
4) DETECTA faltantes y AMBIGÜEDADES. NUNCA inventes ni asumas color, talla, modelo, dirección, teléfono o valor. Si no aparece explícito, déjalo vacío.
5) DECIDE el status:
   - "complete": hay nombre, teléfono, dirección, valor>0 y cada producto tiene los atributos que su modelo requiere (según el catálogo).
   - "needs_clarification": falta algo o hay ambigüedad. Pon en "questions" preguntas CONCRETAS (una por dato faltante), referenciando a qué producto/línea pertenece (ej. "¿De qué color es la tercera pantufla?").
   - "not_order": el texto no es un pedido (saludo, consulta general, etc.).

Reglas de extracción:
- value_to_collect: número entero sin puntos ni comas (ej. 60000). Solo si hay un monto explícito; si no hay monto, déjalo en 0.
- Varios teléfonos: el celular (10 dígitos que empieza por 3) va en phone; los demás a comment como "Tel alternativo: …".
- Si mencionan forma de pago ("contraentrega", "ya pagó/transfirió/anticipado", "abono"), anótalo en comment (ej. "Pago: anticipado por transferencia").
- Ciudad por defecto: ${'Bogotá'} si no se menciona.
- Si la talla/color pedidos NO están en el catálogo de ese producto, marca needs_clarification y sugiere las opciones disponibles; no confirmes una variante fuera de catálogo.
- Sé breve en "message" (una frase). No repitas todo el pedido.

SIEMPRE responde SOLO con un JSON válido con esta forma exacta:
{
  "status": "complete" | "needs_clarification" | "not_order",
  "order": {
    "client_name": "string",
    "phone": "string",
    "address": "string",
    "complement": "string",
    "value_to_collect": number,
    "city": "string",
    "comment": "string"
  },
  "products": [
    { "model": "string", "color": "string", "size": "string", "quantity": number }
  ],
  "questions": ["string"],
  "message": "string (resumen breve, o las preguntas si falta info)"
}`;
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

/** Mensaje conversacional a partir de las preguntas de aclaración. */
function buildClarifyMessage(questions: string[], llmMessage?: string): string {
  if (!questions.length) return llmMessage?.trim() || 'Necesito un poco más de información para completar el pedido.';
  if (questions.length === 1) return questions[0];
  return `Para completar el pedido necesito que me aclares:\n${questions.map((q) => `• ${q}`).join('\n')}`;
}

export async function POST(request: NextRequest) {
  const scoped = await getRequestScopedClient();
  if (!scoped) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  const { ctx, client } = scoped;

  const apiKey = await resolveApiKey(client);

  // Degradación elegante: sin API key el asistente IA no está disponible, pero el
  // usuario puede usar el formulario manual. Discriminable por code en el cliente.
  if (!apiKey) {
    return NextResponse.json(
      {
        status: 'not_order',
        code: 'AI_UNAVAILABLE',
        message: 'El asistente de IA no está disponible ahora. Crea el pedido en la pestaña "Formulario".',
      },
      { status: 503 },
    );
  }

  try {
    const { message, context } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    const [cfg, productsRes, inventoryRes] = await Promise.all([
      loadTenantConfig(ctx.tenantId, ctx.tenantSlug),
      client.from('products').select('code, name, cost'),
      client.from('inventory').select('model, color, size').eq('status', 'Bueno').gt('quantity', 0),
    ]);

    const products = (productsRes.data ?? []) as Array<{ code?: string; name?: string; cost?: number }>;
    const inventory = (inventoryRes.data ?? []) as Array<{ model?: string; color?: string; size?: string }>;
    const idx = buildCatalogIndex(products, inventory);

    const openai = new OpenAI({ apiKey });
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(cfg, buildCatalogSummary(idx)) },
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
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const choice = completion.choices[0];
    const content = choice?.message?.content;

    // Truncado por longitud → JSON roto. Avisar en vez de crashear.
    if (choice?.finish_reason === 'length') {
      return NextResponse.json({
        status: 'needs_clarification',
        code: 'AI_TRUNCATED',
        questions: ['El pedido es muy largo y se cortó. ¿Puedes enviarlo en partes?'],
        message: 'El pedido es muy largo y se cortó. ¿Puedes enviarlo en partes?',
      });
    }
    if (!content) {
      return NextResponse.json({ error: 'Sin respuesta de la IA' }, { status: 502 });
    }

    let llm: {
      status?: string;
      order?: ParsedOrderCore;
      products?: ParsedProduct[];
      questions?: string[];
      message?: string;
    };
    try {
      llm = JSON.parse(content);
    } catch {
      return NextResponse.json({
        status: 'needs_clarification',
        code: 'AI_BAD_JSON',
        questions: ['No pude leer bien el pedido. ¿Puedes reescribirlo con los datos del cliente y el producto?'],
        message: 'No pude leer bien el pedido. ¿Puedes reescribirlo con los datos del cliente y el producto?',
      });
    }

    // Normalización server-side del monto (no confiar en el número del modelo).
    const order: ParsedOrderCore = { ...(llm.order ?? {}) };
    order.value_to_collect = parseCopAmount(order.value_to_collect ?? null) ?? 0;
    const lineItems: ParsedProduct[] = Array.isArray(llm.products) ? llm.products : [];

    const decision = decideClarification({ ...llm, order, products: lineItems }, idx);

    if (decision.status === 'not_order') {
      return NextResponse.json({
        status: 'not_order',
        message: llm.message?.trim() || 'No parece un pedido. Envíame los datos del cliente y el producto.',
      });
    }

    if (decision.status === 'needs_clarification') {
      return NextResponse.json({
        status: 'needs_clarification',
        questions: decision.questions,
        products: lineItems,
        partial: order,
        message: buildClarifyMessage(decision.questions, llm.message),
      });
    }

    // complete → componer el detail legible y resolver product_ref contra catálogo.
    const detail = composeDetail(lineItems) || (order.detail?.trim() ?? '');
    const firstModel = (lineItems[0]?.model ?? '').toLowerCase();
    const matched = firstModel
      ? products.find(
          (p) => (p.name && p.name.toLowerCase() === firstModel)
            || (p.code && p.code.toLowerCase() === firstModel),
        )
      : undefined;

    const finalOrder: ParsedOrder = {
      client_name: order.client_name?.trim() ?? '',
      phone: order.phone?.trim() ?? '',
      address: order.address?.trim() ?? '',
      complement: order.complement?.trim() ?? '',
      detail,
      value_to_collect: order.value_to_collect ?? 0,
      city: order.city?.trim() || 'Bogotá',
      product_ref: matched?.code ?? '',
      comment: order.comment?.trim() ?? '',
    };

    return NextResponse.json({
      status: 'complete',
      order: finalOrder,
      products: lineItems,
      message: llm.message?.trim() || `Pedido de ${finalOrder.client_name || 'cliente'}: ${detail}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('AI parse error:', message);
    return NextResponse.json({ error: 'No se pudo procesar el pedido' }, { status: 500 });
  }
}
