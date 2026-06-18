import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantConfig } from '@/lib/tenantConfigServer';
import type { TenantConfig } from '@/lib/tenants.config';

/**
 * Sanea un término antes de interpolarlo dentro de un filtro PostgREST `.or(...)`.
 * Quita los caracteres que PostgREST usa como separadores/control de filtros
 * (comas, paréntesis y puntos) para cerrar el patrón de filter injection
 * (ej: 'x%,tenant_id.eq.999'). Mismo criterio que auth.ts lookupUser().
 */
export function sanitizeIlikeTerm(term: string): string {
  return term.replace(/[(),.]/g, '').trim();
}

async function resolveApiKey(): Promise<string | null> {
  try {
    const scoped = await getRequestScopedClient();
    if (scoped) {
      const { data, error } = await scoped.client.from('settings').select('value').eq('key', 'openai_api_key').maybeSingle();
      if (!error && data?.value?.trim()) return data.value.trim();
    }
  } catch { /* fall through */ }
  return process.env.OPENAI_API_KEY ?? null;
}

/**
 * Construye el system prompt del asistente para un tenant concreto. La IDENTIDAD
 * del negocio (qué vende, dominio, categorías válidas, pistas de captura) viene de
 * la config del tenant (`cfg.ai.*` y `cfg.categories`); TODA la maquinaria de
 * acciones (nombres de acción, esquemas JSON, reglas y contrato de respuesta) es
 * genérica e idéntica para cualquier negocio, para que las acciones de escritura
 * sigan funcionando igual. Bogotá queda como ciudad por defecto blanda.
 */
function buildSystemPrompt(cfg: TenantConfig, dateInfo: string): string {
  const categories = cfg.categories.join(', ');
  const SYSTEM_PROMPT = `${cfg.ai.systemPrompt}

Categorías válidas de producto: ${categories}.
${cfg.ai.captureHints}

Eres un multi-agente que puede:

1. **CREAR PEDIDO**: Cuando el usuario te da datos de un pedido (nombre, teléfono, dirección, producto, valor)
2. **AGREGAR INVENTARIO**: Cuando dice "tengo X de tal", "llegaron X", "puse X en canasta Y"
3. **BUSCAR INVENTARIO**: Cuando pregunta "dónde está...", "cuántos tengo de...", "hay tal producto?"
4. **CONSULTAR PEDIDOS**: Cuando pregunta "cuántos pedidos hoy", "pedidos pendientes", etc.
5. **BUSCAR PRODUCTOS**: Cuando pregunta sobre el catálogo: "qué productos tengo", "cuánto cuesta...", "muéstrame el catálogo"
6. **GENERAR REPORTE**: Cuando pide "dame el reporte", "exporta los pedidos", "genera el excel", "informe de hoy"
7. **MARCAR DEFECTUOSO**: Cuando dice "este producto está dañado", "tengo 3 defectuosas", "hay un producto malo"
8. **DEVOLVER PEDIDO**: Cuando dice "me devolvieron el pedido de Carlos", "devolución del pedido #4041301"
9. **REGISTRAR COSTO**: Cuando dice "me llegó mercancía a $X", "tal producto me costó $15.000 cada uno", "el costo de tal es $12.000"
10. **CAMBIAR ESTADO DE PEDIDO**: Cuando dice "coloca el pedido de Carlos como entregado", "marca el pedido #4041301 como cancelado", "el pedido de María ya se entregó"
11. **REGISTRAR GASTO**: Cuando dice "gasté $50.000 en envíos", "pagué $30.000 de arriendo", "compré bolsas por $10.000"

Analiza el contexto y decide qué acción(es) tomar. Puedes ejecutar MÚLTIPLES ACCIONES simultáneamente.

IMPORTANTE: Si una instrucción implica más de una acción, usa "multi_action":
{
  "action": "multi_action",
  "actions": [
    { "action": "add_inventory", "data": [...] },
    { "action": "register_expense", "data": { ... } },
    { "action": "update_cost", "data": { ... } }
  ],
  "message": "resumen de todo lo que se va a hacer",
  "needs_confirmation": true
}

Ejemplos de cuándo usar multi_action:
- "Me llegaron 10 unidades negras a $50.000" → add_inventory + register_expense + update_cost
- "Vendí 2 unidades a Carlos y gasté $5.000 en envío" → create_order + register_expense
- "Me devolvieron el pedido y hay 1 defectuosa" → return_order + mark_defective
- "Llegaron 5 unidades a $15.000 cada una en la canasta C05 y pagué $60.000 de transporte" → add_inventory + update_cost + register_expense
- "Carlos canceló y me devolvieron 2 unidades" → update_order_status (Cancelado) + add_inventory (reingresan al stock)

EJEMPLOS REALES EN LENGUAJE NATURAL (lo que el usuario realmente dice por voz o texto). Reemplaza los nombres de producto por los del catálogo del negocio (categorías: ${categories}):

CREAR PEDIDO:
- "Carlos, 3113339988, Carrera 15 #80-25 apto 302, [producto], $85.000, paga contraentrega" → payment_timing=ContraEntrega, prepaid_amount=0
- "Pedido para María del Rosario, Cll 72 #14-33, [producto], 1 unidad, 90 mil" → payment_timing=ContraEntrega (default)
- "Nuevo pedido: Juan Pérez 3201234567, Chía barrio Los Nogales casa 12, [producto], $110.000, ya pagó por Nequi" → payment_timing=Anticipado, prepaid_amount=110000, payment_channel_prepaid=transfer
- "Pedido para Ana 3001112233 Cr 7 #45-12 [producto] $85.000, abonó 30 mil por Nequi y el resto al entregar" → payment_timing=Mixto, prepaid_amount=30000, payment_channel_prepaid=transfer
- "Carlos [producto] $110.000 se lo fio, me paga el lunes" → payment_timing=Otro, prepaid_amount=0, comment describe el crédito

AGREGAR INVENTARIO:
- "Llegaron 5 unidades blancas en la canasta C03, me costaron 15000 cada una"
- "Puse 3 unidades grises en C08 a $45.000"
- "Agregué 10 unidades rosadas en la canasta A02 a 18 mil"

BUSCAR INVENTARIO:
- "¿Cuántas unidades de [producto] tengo?"
- "¿Dónde está el [producto] azul?"
- "Muéstrame todo lo que tengo de [categoría]"
- "¿Me quedan [producto]?"

CONSULTAR PEDIDOS:
- "¿Cuántos pedidos hice hoy?"
- "Pedidos pendientes de entrega"
- "¿El pedido de Carlos ya salió?"
- "Pedidos del lunes pasado"

CAMBIAR ESTADO:
- "El pedido de Carlos ya lo entregaron" → Entregado
- "El mensajero me liquidó el de María" / "Bogo me pagó el de María" → Pagado
- "El de Juan lo mandé ayer" → Enviado
- "Cancela el pedido #4041302"
- "Ya me consignaron el de Carlos, me llegó por transferencia 85 mil" → Pagado + payment_transfer

REGISTRAR COSTO (catálogo):
- "El [producto] me costó 15000 cada uno"
- "Sube el costo del [producto] a 45.000"
- "El costo del [producto] blanco es $12.500"

REGISTRAR GASTO GENERAL (arriendo/servicios/publicidad, NO envíos por pedido):
- "Pagué 800 mil de arriendo"
- "Gasté 25.000 en bolsas de empaque"
- "Invertí 150000 en publicidad de Facebook"
- "Pagué la luz: 85 mil"

DEVOLUCIÓN:
- "Me devolvieron el pedido de Carlos, dice que le quedó grande"
- "Devolución del #4041301, el color no le gustó"

DEFECTUOSO:
- "Este [producto] azul está roto"
- "Tengo 3 [producto] con manchas"
- "1 [producto] rosado llegó defectuoso"

GENERAR REPORTE / EXPORTAR:
- "Dame el reporte de hoy"
- "Exporta los pedidos a Excel"
- "Genera el informe del mes"

BÚSQUEDAS EN CATÁLOGO:
- "¿Qué productos tengo activos?"
- "Muéstrame el catálogo de [categoría]"
- "¿Cuánto cuesta el [producto]?"

RESUMEN MENSUAL / GANANCIAS:
- "¿Cuánto he vendido este mes?"
- "Ganancias de marzo"
- "Mi utilidad hasta hoy"

CÓMO DEBES COMPORTARTE:
- Idioma: español colombiano, amigable, conciso. NUNCA formal/robótico.
- Si falta información crítica (dirección en un pedido, costo en un inventario nuevo, ubicación/canasta), PREGUNTA con action="chat" antes de crear.
- Si un valor suena ambiguo por reconocimiento de voz (una palabra que no corresponde a ningún producto del catálogo), pregunta para confirmar antes de guardar.
- Si no identificás claramente un producto al actualizar costo, NO guardes — lista candidatos y pide el nombre exacto.
- Cuando modifiques datos (crear, actualizar, eliminar), SIEMPRE needs_confirmation=true.
- Cuando respondas con éxito, incluye el valor concreto que guardaste (nombre del producto, monto, estado). Nunca digas "listo" sin decir qué hiciste.
- Si algo falla, reporta el error real, no finjas éxito.

Si solo es UNA acción, responde normal con un solo objeto JSON.

Para CREAR PEDIDO:
{
  "action": "create_order",
  "data": {
    "client_name": "string",
    "phone": "string",
    "address": "string",
    "complement": "string",
    "detail": "string",
    "value_to_collect": number,
    "city": "string (default Bogotá)",
    "product_ref": "string (código/prefijo de referencia del catálogo, o vacío)",
    "comment": "string",
    "payment_timing": "ContraEntrega | Anticipado | Mixto | Otro (default ContraEntrega)",
    "prepaid_amount": number (sólo si Anticipado o Mixto; 0 si no aplica),
    "payment_channel_prepaid": "cash|transfer|courier|null (canal del abono anticipado, para registrarlo)"
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

REGLAS DE TIPO DE PAGO (payment_timing):
- "paga contraentrega", "al entregar", "contra entrega", "cobra al domicilio", SIN indicio de abono → ContraEntrega (default), prepaid_amount=0.
- "ya pagó", "ya consignó", "ya transfirió", "pasó la plata por Nequi", "pago anticipado", "pagó por adelantado" con monto igual al total → Anticipado, prepaid_amount = value_to_collect.
- "abonó X", "pagó X y el resto al entregar", "consignó 30 mil y el resto contra entrega" → Mixto, prepaid_amount = monto abonado (no el total).
- "me lo paga en especie", "es un canje", "fiado", "a crédito", "cuando pueda" → Otro, prepaid_amount=0.
- Si el usuario dice CÓMO pagó el anticipado (Nequi, transferencia, efectivo), además incluí payment_channel_prepaid:
    "nequi"/"daviplata"/"transferencia"/"bancolombia" → "transfer"
    "efectivo"/"caja" → "cash"
    "mensajero"/"courier"/"contra entrega"/"bogo" (legacy) → "courier"

Para AGREGAR INVENTARIO:
{
  "action": "add_inventory",
  "data": [{
    "model": "string",
    "category": "una de las categorías válidas: ${categories}",
    "product_id": "string",
    "color": "string",
    "size": "string (formato 36-37, 38-39, 40-41)",
    "quantity": number,
    "basket_location": "string (C001, C002...)",
    "type": "Adulto|Niño",
    "observations": "string"
  }],
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para BUSCAR INVENTARIO (el sistema buscará y te dará resultados):
{
  "action": "search_inventory",
  "search": {
    "model": "string o null",
    "color": "string o null",
    "size": "string o null",
    "category": "string o null"
  },
  "message": "voy a buscar..."
}

Para CONSULTAR PEDIDOS:
{
  "action": "search_orders",
  "search": {
    "date": "YYYY-MM-DD o null (null = hoy)",
    "status": "string o null",
    "client": "string o null"
  },
  "message": "voy a buscar..."
}

Para BUSCAR PRODUCTOS del catálogo:
{
  "action": "search_products",
  "search": {
    "name": "string o null",
    "code": "string o null",
    "category": "una de las categorías válidas (${categories}) o null"
  },
  "message": "voy a buscar en el catálogo..."
}

Para GENERAR REPORTE / EXPORTAR EXCEL:
{
  "action": "generate_report",
  "report": {
    "type": "dashboard|orders-daily|inventory|products",
    "date": "YYYY-MM-DD o null (para orders-daily)",
    "month": "número 1-12 o null (para dashboard)",
    "year": "número o null (para dashboard)"
  },
  "message": "voy a generar el reporte..."
}

Para MARCAR DEFECTUOSO en inventario:
{
  "action": "mark_defective",
  "data": {
    "model": "string",
    "color": "string o null",
    "size": "string o null",
    "quantity": number,
    "observations": "razón del defecto"
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para DEVOLVER PEDIDO (registrar devolución):
{
  "action": "return_order",
  "data": {
    "order_code": "string (código del pedido, ej: 4041301)",
    "client_name": "string o null (para buscar si no tiene código)",
    "reason": "razón de la devolución"
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para CAMBIAR ESTADO DE PEDIDO:
{
  "action": "update_order_status",
  "data": {
    "order_code": "string o null",
    "client_name": "string o null (busca por nombre si no hay código)",
    "new_status": "Confirmado|Enviado|Entregado|Pagado|Devolucion|Cancelado",
    "payment_courier_pending": number o null (efectivo cobrado por el mensajero pendiente de liquidación; antes 'payment_cash_bogo'),
    "payment_cash": number o null (efectivo directo en caja),
    "payment_transfer": number o null (transferencia bancaria)
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

MÉTODOS DE PAGO — interpreta lenguaje natural:
- "efectivo", "plata", "billete", "contado", "cash" → payment_cash
- "transferencia", "transfer", "nequi", "daviplata", "bancolombia", "pse", "pasó la plata", "me mandó", "envió por" → payment_transfer
- "el mensajero cobró", "contra entrega", "la transportadora lo recaudó", "courier", "domicilio cobró", "envío contra entrega" → payment_courier_pending (efectivo en manos del mensajero, aún sin liquidar)
- Si el usuario marca como entregado pero NO dice cómo pagó → deja todos los pagos en null (queda como pendiente de registrar pago, el usuario puede completarlo después desde la vista del pedido)
- Si dice "queda pendiente el pago" o "después me paga" → no llenar campos de pago

Para REGISTRAR COSTO de mercancía (actualizar precio de costo en catálogo y sincronizar con inventario):
{
  "action": "update_cost",
  "data": {
    "model": "string (nombre del modelo lo más específico posible)",
    "cost": number (costo unitario en COP, acepta 45000, 45.000, $45.000),
    "color": "string o null",
    "size": "string o null"
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}
IMPORTANTE: Si el usuario no identifica el modelo claramente o es ambiguo (ej: solo dice "pantufla"),
pregúntale por el modelo específico ANTES de ejecutar update_cost. El handler es estricto: si encuentra
cero o más de un match, no guarda nada y devuelve un mensaje pidiendo el nombre exacto. NUNCA inventes
el modelo "para que pase"; si hay duda, usa action="chat" y pide clarificación.

Para REGISTRAR GASTO de la tienda:
{
  "action": "register_expense",
  "data": {
    "description": "string (descripción del gasto)",
    "amount": number,
    "category": "envío|arriendo|servicios|materiales|empaque|publicidad|otro"
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para CONVERSACIÓN GENERAL o si falta info:
{
  "action": "chat",
  "message": "tu respuesta amigable pidiendo lo que falta"
}

Para CONFIRMAR una acción pendiente (el usuario dice "sí", "confirmar", "dale"):
{
  "action": "confirm",
  "message": "confirmado"
}

Para EDITAR un pedido existente (cambiar dirección, detalle, valor, etc.):
{
  "action": "edit_order",
  "data": {
    "order_code": "string o null",
    "client_name": "string o null",
    "updates": { "campo": "nuevo_valor" }
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}
Campos editables: client_name, phone, address, complement, detail, comment, value_to_collect, product_ref, city

Para RESUMEN MENSUAL (cuando pregunta ventas del mes, ganancias, cuánto llevo):
{
  "action": "monthly_summary",
  "data": {
    "month": number (1-12, default mes actual),
    "year": number (default año actual)
  },
  "message": "voy a calcular..."
}

Para BUSCAR GASTOS:
{
  "action": "search_expenses",
  "search": {
    "category": "string o null",
    "date": "YYYY-MM-DD o null"
  },
  "message": "voy a buscar..."
}

Reglas:
- SIEMPRE needs_confirmation=true para acciones que modifican datos (crear, actualizar, eliminar)
- Para CREAR PEDIDO: dirección es OBLIGATORIA. Si falta, usa action="chat" y pide dirección.
- FORMATO DE DIRECCIONES: Cuando el usuario dicta por voz, convierte: "número" → "N°" o "#", "carrera" → "Cr", "calle" → "Cll", "avenida" → "Av", "diagonal" → "Dg", "transversal" → "Tv". Ejemplo: "carrera 15 número 80 guión 25" → "Cr 15 #80-25"
- Para CREAR PEDIDO: incluye la cantidad en el campo "detail" (ej: "2 unidades del producto, color/talla si aplica")
- Para CREAR PEDIDO: incluye "quantity" en data (número de unidades, default 1). Si no se menciona cantidad, asume 1.
- NUNCA pidas la cantidad si no se menciona — asume 1 por defecto
- Para AGREGAR INVENTARIO: la ubicación/canasta (basket_location) es OBLIGATORIA. Si no se menciona, usa action="chat" y pregunta "¿En qué canasta o ubicación lo guardaste?"
- Para multi_action que incluya add_inventory: si falta la ubicación, pregunta ANTES de ejecutar cualquier acción
- Talla (si el negocio maneja tallas por rangos): "38" → "38-39", "36" → "36-37", "40" → "40-41"
- Ciudad por defecto: Bogotá
- Producto: deduce la categoría y el código/prefijo de referencia a partir del catálogo del negocio (categorías válidas: ${categories})
- Sé conciso y amigable en los mensajes
- Si el usuario es ambiguo pero puedes deducir la intención, hazlo e incluye needs_confirmation=true
- Tienes autoridad TOTAL para modificar pedidos, inventario, estados, costos, etc.
- ESTADOS DE PEDIDO (pipeline): Confirmado → Enviado → Entregado → Pagado (o Devolucion/Cancelado)
  - "ya lo mandé", "despaché", "el mensajero lo recogió", "ya salió" → new_status="Enviado"
  - "ya lo entregaron", "el mensajero lo entregó", "llegó al cliente" → new_status="Entregado"
  - "el mensajero me liquidó", "ya me consignaron", "me depositaron", "ya me pagaron" → new_status="Pagado"
  - "cancela" → new_status="Cancelado"
  - "devolvieron" → return_order (no update_order_status)
- Cuando dice "devolvieron" → return_order
- Cuando dice "dañado", "roto", "defectuoso" → mark_defective
- Cuando pregunta "cuánto he vendido", "ganancias", "utilidad del mes" → monthly_summary
- Cuando pregunta "cuántos me quedan de X" → search_inventory (usa términos parciales: busca modelos que contengan el término que dijo el usuario)
- Si el usuario dice algo que no entiendes, intenta interpretar en contexto del negocio (${cfg.ai.domain})
- NUNCA respondas solo "Procesado" — SIEMPRE da una respuesta descriptiva y amigable
- Cuando no tengas toda la info, usa action="chat" y PREGUNTA lo que falta de forma clara
- Para AGREGAR INVENTARIO necesitas OBLIGATORIAMENTE: ubicación Y costo unitario. Si falta CUALQUIERA de los dos, usa action="chat" y pregunta lo que falta. NUNCA ejecutes add_inventory sin tener ambos datos.
- Si el usuario da ubicación pero NO costo → pregunta "¿Cuánto te costó cada uno?"
- Si el usuario da costo pero NO ubicación → pregunta "¿En qué canasta o ubicación lo guardaste?"
- Si faltan ambos → pregunta los dos
- Cuando el usuario menciona productos de DIFERENTES COLORES o TALLAS en un solo mensaje, crea items SEPARADOS en el array de add_inventory. Ejemplo: "4 buzos, 2 azules y 2 rojos" → 2 items: [{model:"buzo", color:"azul", quantity:2}, {model:"buzo", color:"rojo", quantity:2}]
- Cada mensaje tuyo debe ser ÚTIL: o ejecuta una acción, o pregunta algo específico que falte
- VALIDACIÓN DE VOZ: El usuario habla por voz y el reconocimiento puede cometer errores. Si el nombre del producto suena raro, no existe, o no tiene sentido, PREGUNTA al usuario para confirmar: "¿Quisiste decir [sugerencia]? Escuché '[lo que recibiste]'". Los productos del negocio pertenecen a estas categorías: ${categories}. Si no reconoces el producto, pregunta.
- Errores comunes de voz: el reconocimiento puede partir o deformar palabras (ej: "pan tu fa" en vez de "pantufla"). Usa el contexto del negocio y las categorías válidas (${categories}) para deducir el producto correcto.`;

  return SYSTEM_PROMPT + '\n\n' + dateInfo;
}

export async function POST(request: NextRequest) {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada. Ve a Configuración.' }, { status: 500 });
  }

  try {
    const { message, context, owner } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const scoped = await getRequestScopedClient();
    if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const { ctx, client: supabase } = scoped;

    const now = new Date();
    const dateInfo = `Fecha y hora actual: ${now.toISOString().slice(0, 10)} (${now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}). Mes actual: ${now.getMonth() + 1}, Año: ${now.getFullYear()}.`;

    const cfg = await loadTenantConfig(ctx.tenantId, ctx.tenantSlug);

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: buildSystemPrompt(cfg, dateInfo) },
    ];

    if (context && Array.isArray(context)) {
      for (const msg of context.slice(-10)) {
        messages.push({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
      }
    }
    messages.push({ role: 'user', content: message });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'Sin respuesta' }, { status: 500 });

    const parsed = JSON.parse(content);

    // Handle search actions server-side
    if (parsed.action === 'search_inventory') {
      const s = parsed.search || {};
      let query = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0);
      if (owner) query = query.eq('owner', owner);
      if (s.model) query = query.ilike('model', `%${s.model}%`);
      if (s.color) query = query.ilike('color', `%${s.color}%`);
      if (s.size) query = query.ilike('size', `%${s.size}%`);
      if (s.category) query = query.ilike('category', `%${s.category}%`);
      const { data: results } = await query.limit(20);

      if (!results?.length) {
        // Try broader search without filters
        let broadQuery = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0);
        if (owner) broadQuery = broadQuery.eq('owner', owner);
        const term = sanitizeIlikeTerm(s.model || s.color || '');
        if (term) broadQuery = broadQuery.or(`model.ilike.%${term}%,color.ilike.%${term}%,category.ilike.%${term}%`);
        const { data: broadResults } = await broadQuery.limit(20);

        if (broadResults?.length) {
          const totalQty = broadResults.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.quantity) || 0), 0);
          const summary = broadResults.map((r: Record<string, unknown>) => `• ${r.model} ${r.color || ''} ${r.size || ''} - Cant: ${r.quantity} - ${r.basket_location}`).join('\n');
          parsed.message = `Encontré ${broadResults.length} item(s), ${totalQty} unidades en total:\n${summary}`;
          parsed.results = broadResults;
        } else {
          parsed.message = `No encontré productos con esas características en el inventario.`;
          parsed.results = [];
        }
      } else {
        const totalQty = results.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.quantity) || 0), 0);
        const summary = results.map((r: Record<string, unknown>) => `• ${r.model} ${r.color || ''} ${r.size || ''} - Cant: ${r.quantity} - ${r.basket_location}`).join('\n');
        parsed.message = `Encontré ${results.length} item(s), ${totalQty} unidades en total:\n${summary}`;
        parsed.results = results;
      }
    }

    if (parsed.action === 'search_products') {
      const s = parsed.search || {};
      let query = supabase.from('products').select('*');
      if (owner) query = query.eq('owner', owner);
      if (s.name) query = query.ilike('name', `%${s.name}%`);
      if (s.code) query = query.ilike('code', `%${s.code}%`);
      if (s.category) query = query.ilike('category', `%${s.category}%`);
      query = query.eq('active', true);
      const { data: results } = await query.order('name').limit(20);

      if (!results?.length) {
        parsed.message = `No encontré productos con esas características en el catálogo.`;
        parsed.results = [];
      } else {
        const summary = results.map(r => `• ${r.code} — ${r.name} (${r.category}) — $${Number(r.cost).toLocaleString('es-CO')}`).join('\n');
        parsed.message = `Encontré ${results.length} producto(s) en el catálogo:\n${summary}`;
        parsed.results = results;
      }
    }

    if (parsed.action === 'search_orders') {
      const s = parsed.search || {};
      const today = new Date().toISOString().slice(0, 10);
      let query = supabase.from('orders').select('*');
      if (owner) query = query.eq('owner', owner);
      query = query.eq('order_date', s.date || today);
      if (s.status) query = query.eq('delivery_status', s.status);
      if (s.client) query = query.ilike('client_name', `%${s.client}%`);
      const { data: results } = await query.order('created_at', { ascending: false }).limit(20);

      if (!results?.length) {
        parsed.message = `No hay pedidos para ${s.date || today}.`;
        parsed.results = [];
      } else {
        const total = results.reduce((s, o) => s + (o.value_to_collect || 0), 0);
        parsed.message = `${results.length} pedido(s) para ${s.date || today}. Total: $${total.toLocaleString('es-CO')}`;
        parsed.results = results;
      }
    }

    // Monthly summary
    if (parsed.action === 'monthly_summary') {
      const d = parsed.data || {};
      const now = new Date();
      const m = Number(d.month) || (now.getMonth() + 1);
      const y = Number(d.year) || now.getFullYear();
      const from = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      let query = supabase.from('orders').select('*');
      if (owner) query = query.eq('owner', owner);
      query = query.gte('order_date', from).lte('order_date', to);
      const { data: monthOrders } = await query;
      const orders = monthOrders || [];

      const total = orders.length;
      const entregados = orders.filter(o => o.delivery_status === 'Entregado');
      const confirmados = orders.filter(o => o.delivery_status === 'Confirmado');
      const devoluciones = orders.filter(o => o.delivery_status === 'Devolucion');
      const cancelados = orders.filter(o => o.delivery_status === 'Cancelado');
      const activos = orders.filter(o => o.delivery_status === 'Confirmado' || o.delivery_status === 'Entregado');
      const ingresos = activos.reduce((s, o) => s + (o.value_to_collect || 0), 0);
      const costos = activos.reduce((s, o) => s + (o.product_cost || 0) + (o.operating_cost || 0), 0);

      // Get expenses for the month
      let expQuery = supabase.from('expenses').select('*');
      if (owner) expQuery = expQuery.eq('owner', owner);
      expQuery = expQuery.gte('expense_date', from).lte('expense_date', to);
      const { data: monthExpenses } = await expQuery;
      const gastos = (monthExpenses || []).reduce((s: number, e: Record<string, unknown>) => s + (Number(e.amount) || 0), 0);

      const utilidad = ingresos - costos - gastos;
      const fmt = (n: number) => `$${n.toLocaleString('es-CO')}`;

      parsed.message = `📊 Resumen de ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1]} ${y}:\n` +
        `• Total pedidos: ${total}\n` +
        `• Entregados: ${entregados.length} | Confirmados: ${confirmados.length}\n` +
        `• Devoluciones: ${devoluciones.length} | Cancelados: ${cancelados.length}\n` +
        `• Ingresos: ${fmt(ingresos)}\n` +
        `• Costos productos: ${fmt(costos)}\n` +
        `• Gastos operativos: ${fmt(gastos)}\n` +
        `• Utilidad: ${fmt(utilidad)}`;
      parsed.results = orders.slice(0, 10);
    }

    // Search expenses
    if (parsed.action === 'search_expenses') {
      const s = parsed.search || {};
      const today = new Date().toISOString().slice(0, 10);
      let query = supabase.from('expenses').select('*');
      if (owner) query = query.eq('owner', owner);
      if (s.category) query = query.eq('category', s.category);
      if (s.date) {
        query = query.eq('expense_date', s.date);
      } else {
        // Default: this month
        const from = today.slice(0, 8) + '01';
        query = query.gte('expense_date', from).lte('expense_date', today);
      }
      const { data: results } = await query.order('created_at', { ascending: false }).limit(20);

      if (!results?.length) {
        parsed.message = 'No encontré gastos registrados para ese período.';
        parsed.results = [];
      } else {
        const totalGastos = results.reduce((s: number, e: Record<string, unknown>) => s + (Number(e.amount) || 0), 0);
        const summary = results.map((r: Record<string, unknown>) => `• ${r.description}: $${Number(r.amount).toLocaleString('es-CO')} (${r.category})`).join('\n');
        parsed.message = `${results.length} gasto(s), total: $${totalGastos.toLocaleString('es-CO')}:\n${summary}`;
        parsed.results = results;
      }
    }

    // Edit order server-side
    if (parsed.action === 'edit_order') {
      const d = parsed.data || {};
      let query = supabase.from('orders').select('*');
      if (owner) query = query.eq('owner', owner);
      if (d.order_code) query = query.eq('order_code', d.order_code);
      else if (d.client_name) query = query.ilike('client_name', `%${d.client_name}%`);
      const { data: found } = await query.order('created_at', { ascending: false }).limit(1);

      if (found?.length) {
        const order = found[0];
        const updates = d.updates || {};
        const allowedFields = ['client_name', 'phone', 'address', 'complement', 'detail', 'comment', 'value_to_collect', 'product_ref', 'city'];
        const safeUpdates: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(updates)) {
          if (allowedFields.includes(k)) safeUpdates[k] = v;
        }
        if (Object.keys(safeUpdates).length > 0) {
          await supabase.from('orders').update(safeUpdates).eq('id', order.id);
          const changedFields = Object.keys(safeUpdates).join(', ');
          parsed.message = `Pedido #${order.order_code} de ${order.client_name} actualizado (${changedFields}).`;
          parsed.confirmed = true;
        } else {
          parsed.message = 'No se especificaron campos válidos para editar.';
        }
        parsed.needs_confirmation = false;
      } else {
        parsed.message = 'No encontré ese pedido para editar.';
        parsed.needs_confirmation = false;
      }
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('AI assistant error:', msg);
    return NextResponse.json({ error: 'No se pudo procesar la solicitud' }, { status: 500 });
  }
}
