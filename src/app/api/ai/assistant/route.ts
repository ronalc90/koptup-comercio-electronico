import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantConfig } from '@/lib/tenantConfigServer';
import type { TenantConfig } from '@/lib/tenants.config';
import { resolveSingleMatch } from '@/lib/assistant/matching';
import { ACTIVE_REVENUE_STATUSES, EDITABLE_ORDER_FIELDS, EDITABLE_EXPENSE_FIELDS } from '@/lib/assistant/constants';
import { normalizeExpenseCategory, resolveDateRange } from '@/lib/assistant/validation';

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
12. **CREAR PRODUCTO** en el catálogo / **EDITAR PRODUCTO** (nombre, categoría, costo, activar/desactivar)
13. **AJUSTAR STOCK** (corregir la cantidad exacta de un item) / **MOVER** un item de canasta
14. **EDITAR un GASTO** ya registrado / **DESGLOSE de gastos por categoría** / buscar gastos por rango de fechas
15. **ALERTAS**: listar las alertas abiertas del negocio y marcarlas como resueltas
16. **REIMPRIMIR GUÍA**: volver a mostrar la guía de despacho de un pedido existente

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

Para BUSCAR GASTOS (acepta día exacto O rango desde/hasta):
{
  "action": "search_expenses",
  "search": {
    "category": "string o null",
    "date": "YYYY-MM-DD o null (día exacto; tiene prioridad sobre el rango)",
    "date_from": "YYYY-MM-DD o null",
    "date_to": "YYYY-MM-DD o null"
  },
  "message": "voy a buscar..."
}

Para DESGLOSE DE GASTOS POR CATEGORÍA ("¿en qué gasté?", "desglose de gastos de mayo"):
{
  "action": "expense_totals_by_category",
  "data": {
    "month": "número 1-12 o null (default mes actual)",
    "year": "número o null",
    "date_from": "YYYY-MM-DD o null",
    "date_to": "YYYY-MM-DD o null"
  },
  "message": "voy a calcular..."
}

Para EDITAR un gasto ya registrado ("el arriendo eran 850 mil", "cámbiale la categoría a servicios al gasto de la luz"):
{
  "action": "edit_expense",
  "data": {
    "expense_id": number o null,
    "description": "texto para ubicar el gasto si no hay id, o null",
    "amount": number o null (para ubicarlo),
    "expense_date": "YYYY-MM-DD o null (para ubicarlo)",
    "updates": { "description": "...", "amount": number, "category": "...", "expense_date": "YYYY-MM-DD" }
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para CREAR un PRODUCTO en el catálogo ("crea el producto X código Y a $Z", "da de alta tal repuesto"):
{
  "action": "create_product",
  "data": {
    "code": "string (código corto del producto, ej: CAS001)",
    "name": "string",
    "cost": number (costo en COP),
    "category": "una de las categorías válidas: ${categories}",
    "active": true
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}
IMPORTANTE create_product: el código es OBLIGATORIO. Si el usuario no lo da, PREGÚNTALO con action="chat" antes de crear (no lo inventes).

Para EDITAR un PRODUCTO existente (nombre, categoría, costo o activar/desactivar):
{
  "action": "edit_product",
  "data": {
    "code": "string o null (código exacto del producto)",
    "name_match": "string o null (para ubicarlo por nombre si no hay código)",
    "updates": { "name": "...", "category": "...", "cost": number, "active": true/false }
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para AJUSTAR/CORREGIR el stock de un item de inventario ("corrige el stock de X a 5", "quedan 8 de tal"):
{
  "action": "adjust_inventory",
  "data": {
    "model": "string",
    "color": "string o null",
    "size": "string o null",
    "basket_location": "string o null (para desambiguar)",
    "quantity": number (cantidad EXACTA que queda; >= 0)
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para MOVER un item de inventario de canasta/ubicación ("pasa las X de la C03 a la C10"):
{
  "action": "move_inventory",
  "data": {
    "model": "string",
    "color": "string o null",
    "size": "string o null",
    "from_location": "string o null (canasta actual, para desambiguar)",
    "to_location": "string (canasta/ubicación destino)"
  },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para LISTAR ALERTAS abiertas del negocio ("¿qué alertas tengo?", "avisos pendientes"):
{
  "action": "search_alerts",
  "message": "voy a revisar las alertas..."
}

Para RESOLVER/MARCAR una alerta como atendida ("resuelve la alerta de stock bajo", "marca como vista la alerta X"):
{
  "action": "resolve_alert",
  "data": { "alert_id": number o null, "title": "texto para ubicar la alerta si no hay id" },
  "message": "resumen amigable",
  "needs_confirmation": true
}

Para VOLVER A MOSTRAR la guía de despacho de un pedido ("dame la guía del pedido #4061801", "imprime la guía de Carlos"):
{
  "action": "reprint_order_guide",
  "data": { "order_code": "string o null", "client_name": "string o null" },
  "message": "aquí está la guía"
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
    // `owner` ya NO se usa para filtrar: el aislamiento lo da el scoping por
    // tenant (getRequestScopedClient/withTenant). Filtrar por owner='<username>'
    // rompía el ciclo crear→consultar (las escrituras no guardan owner; las
    // filas quedan con el default 'Paola'), así que el chat "no veía" lo recién
    // creado. Se ignora aunque el cliente aún lo envíe (compat de despliegue).
    const { message, context } = await request.json();
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
      // 1500 (antes 1000) para que un multi_action grande no se trunque a la
      // mitad del JSON. Si aun así se corta, lo detectamos abajo.
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    if (!content) return NextResponse.json({ error: 'Sin respuesta' }, { status: 500 });

    // Si el modelo se quedó sin tokens, el JSON viene incompleto: avisamos en
    // vez de fallar con un JSON.parse críptico (mejor que un 500 sin contexto).
    if (choice.finish_reason === 'length') {
      return NextResponse.json(
        { error: 'La instrucción es muy larga para procesar de una. Divídela en pasos más cortos.' },
        { status: 422 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('AI assistant: JSON inválido del modelo:', content.slice(0, 500));
      return NextResponse.json(
        { error: 'No entendí bien la respuesta. Reformúlalo en palabras más simples.' },
        { status: 422 },
      );
    }

    // Aviso de truncado: las búsquedas piden hasta SEARCH_LIMIT filas; si llega
    // el tope, hay más y se lo decimos a la usuaria (antes parecía el total).
    const SEARCH_LIMIT = 20;
    const moreHint = (n: number) =>
      n >= SEARCH_LIMIT ? ` (mostrando los primeros ${SEARCH_LIMIT}, puede haber más)` : '';

    // Handle search actions server-side
    if (parsed.action === 'search_inventory') {
      const s = parsed.search || {};
      let query = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0);
      if (s.model) query = query.ilike('model', `%${s.model}%`);
      if (s.color) query = query.ilike('color', `%${s.color}%`);
      if (s.size) query = query.ilike('size', `%${s.size}%`);
      if (s.category) query = query.ilike('category', `%${s.category}%`);
      const { data: results, error } = await query.limit(SEARCH_LIMIT);

      if (error) {
        parsed.message = 'No pude consultar el inventario en este momento. Inténtalo de nuevo.';
        parsed.results = [];
      } else if (!results?.length) {
        // Try broader search without filters
        let broadQuery = supabase.from('inventory').select('*').eq('status', 'Bueno').gt('quantity', 0);
        const term = sanitizeIlikeTerm(s.model || s.color || '');
        if (term) broadQuery = broadQuery.or(`model.ilike.%${term}%,color.ilike.%${term}%,category.ilike.%${term}%`);
        const { data: broadResults } = await broadQuery.limit(SEARCH_LIMIT);

        if (broadResults?.length) {
          const totalQty = broadResults.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.quantity) || 0), 0);
          const summary = broadResults.map((r: Record<string, unknown>) => `• ${r.model} ${r.color || ''} ${r.size || ''} - Cant: ${r.quantity} - ${r.basket_location}`).join('\n');
          parsed.message = `Encontré ${broadResults.length} item(s)${moreHint(broadResults.length)}, ${totalQty} unidades en total:\n${summary}`;
          parsed.results = broadResults;
        } else {
          parsed.message = `No encontré productos con esas características en el inventario.`;
          parsed.results = [];
        }
      } else {
        const totalQty = results.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.quantity) || 0), 0);
        const summary = results.map((r: Record<string, unknown>) => `• ${r.model} ${r.color || ''} ${r.size || ''} - Cant: ${r.quantity} - ${r.basket_location}`).join('\n');
        parsed.message = `Encontré ${results.length} item(s)${moreHint(results.length)}, ${totalQty} unidades en total:\n${summary}`;
        parsed.results = results;
      }
    }

    if (parsed.action === 'search_products') {
      const s = parsed.search || {};
      let query = supabase.from('products').select('*');
      if (s.name) query = query.ilike('name', `%${s.name}%`);
      if (s.code) query = query.ilike('code', `%${s.code}%`);
      if (s.category) query = query.ilike('category', `%${s.category}%`);
      query = query.eq('active', true);
      const { data: results, error } = await query.order('name').limit(SEARCH_LIMIT);

      if (error) {
        parsed.message = 'No pude consultar el catálogo en este momento. Inténtalo de nuevo.';
        parsed.results = [];
      } else if (!results?.length) {
        parsed.message = `No encontré productos con esas características en el catálogo.`;
        parsed.results = [];
      } else {
        const summary = results.map(r => `• ${r.code} — ${r.name} (${r.category}) — $${Number(r.cost).toLocaleString('es-CO')}`).join('\n');
        parsed.message = `Encontré ${results.length} producto(s)${moreHint(results.length)} en el catálogo:\n${summary}`;
        parsed.results = results;
      }
    }

    if (parsed.action === 'search_orders') {
      const s = parsed.search || {};
      const today = new Date().toISOString().slice(0, 10);
      let query = supabase.from('orders').select('*');
      // Si hay fecha explícita, filtramos por ese día. Si NO hay fecha pero sí
      // un estado ("pedidos pendientes/sin entregar"), NO restringimos a hoy:
      // buscamos por estado en todas las fechas (los pedidos atrasados son justo
      // los que importan). Solo cuando no hay ni fecha ni estado caemos a hoy.
      const byDate = s.date || (!s.status ? today : null);
      if (byDate) query = query.eq('order_date', byDate);
      if (s.status) query = query.eq('delivery_status', s.status);
      if (s.client) query = query.ilike('client_name', `%${s.client}%`);
      const { data: results, error } = await query.order('created_at', { ascending: false }).limit(SEARCH_LIMIT);

      const scope = byDate ? `para ${byDate}` : (s.status ? `en estado "${s.status}"` : 'encontrados');
      if (error) {
        parsed.message = 'No pude consultar los pedidos en este momento. Inténtalo de nuevo.';
        parsed.results = [];
      } else if (!results?.length) {
        parsed.message = `No hay pedidos ${scope}.`;
        parsed.results = [];
      } else {
        const total = results.reduce((acc, o) => acc + (o.value_to_collect || 0), 0);
        parsed.message = `${results.length} pedido(s) ${scope}${moreHint(results.length)}. Total: $${total.toLocaleString('es-CO')}`;
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
      query = query.gte('order_date', from).lte('order_date', to);
      const { data: monthOrders } = await query;
      const orders = monthOrders || [];

      const total = orders.length;
      const entregados = orders.filter(o => o.delivery_status === 'Entregado');
      const confirmados = orders.filter(o => o.delivery_status === 'Confirmado');
      const devoluciones = orders.filter(o => o.delivery_status === 'Devolucion');
      const cancelados = orders.filter(o => o.delivery_status === 'Cancelado');
      // Ingresos = pedidos "activos" (Confirmado/Enviado/Entregado/Pagado),
      // EXCLUYE Devolucion y Cancelado. Mismo criterio que el Dashboard para que
      // el resumen del chat y el tablero NO se contradigan.
      const activos = orders.filter(o => ACTIVE_REVENUE_STATUSES.includes(o.delivery_status));
      const ingresos = activos.reduce((s, o) => s + (o.value_to_collect || 0), 0);
      const costos = activos.reduce((s, o) => s + (o.product_cost || 0) + (o.operating_cost || 0), 0);

      // Get expenses for the month
      let expQuery = supabase.from('expenses').select('*');
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
      // Categoría normalizada al enum (antes el .eq crudo no matcheaba por acento/caso).
      if (s.category) query = query.eq('category', normalizeExpenseCategory(s.category));
      const range = resolveDateRange(s.date_from, s.date_to, today);
      if (s.date) {
        query = query.eq('expense_date', s.date); // día exacto tiene prioridad
      } else if (range) {
        query = query.gte('expense_date', range.from).lte('expense_date', range.to);
      } else {
        // Default: this month
        const from = today.slice(0, 8) + '01';
        query = query.gte('expense_date', from).lte('expense_date', today);
      }
      const { data: results, error } = await query.order('created_at', { ascending: false }).limit(SEARCH_LIMIT);

      if (error) {
        parsed.message = 'No pude consultar los gastos en este momento. Inténtalo de nuevo.';
        parsed.results = [];
      } else if (!results?.length) {
        parsed.message = 'No encontré gastos registrados para ese período.';
        parsed.results = [];
      } else {
        const totalGastos = results.reduce((s: number, e: Record<string, unknown>) => s + (Number(e.amount) || 0), 0);
        const summary = results.map((r: Record<string, unknown>) => `• ${r.description}: $${Number(r.amount).toLocaleString('es-CO')} (${r.category})`).join('\n');
        parsed.message = `${results.length} gasto(s)${moreHint(results.length)}, total: $${totalGastos.toLocaleString('es-CO')}:\n${summary}`;
        parsed.results = results;
      }
    }

    // Edit order: el route SOLO RESUELVE y PROPONE el cambio (no escribe). La
    // escritura la hace el cliente tras "Confirmar", igual que toda otra acción
    // de escritura. Antes el route ejecutaba el UPDATE durante la interpretación
    // (violaba la regla "toda escritura se confirma" y podía editar el pedido
    // equivocado por ilike+limit(1)).
    if (parsed.action === 'edit_order') {
      const d = parsed.data || {};
      let query = supabase.from('orders').select('*');
      if (d.order_code) query = query.eq('order_code', String(d.order_code));
      else if (d.client_name) query = query.ilike('client_name', `%${d.client_name}%`);
      const { data: found, error } = await query.order('created_at', { ascending: false }).limit(5);

      // Solo campos editables (whitelist espejo del cliente).
      const updates = (d.updates || {}) as Record<string, unknown>;
      const safeUpdates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updates)) {
        if ((EDITABLE_ORDER_FIELDS as readonly string[]).includes(k)) safeUpdates[k] = v;
      }

      const resolution = error ? { kind: 'none' as const } : resolveSingleMatch(found);
      parsed.confirmed = false;
      if (Object.keys(safeUpdates).length === 0) {
        parsed.action = 'chat';
        parsed.needs_confirmation = false;
        parsed.message = 'No identifiqué qué campo querés cambiar. Decime, por ejemplo: "cambia la dirección del pedido de Carlos a Cr 10 #5-5".';
      } else if (resolution.kind === 'none') {
        parsed.action = 'chat';
        parsed.needs_confirmation = false;
        parsed.message = error
          ? 'No pude buscar el pedido en este momento. Inténtalo de nuevo.'
          : 'No encontré ese pedido. Dame el código (ej. #4061801) o el nombre exacto del cliente.';
      } else if (resolution.kind === 'ambiguous') {
        // Más de un pedido coincide: NO editamos a ciegas; pedimos desambiguar.
        const list = resolution.candidates
          .map((o) => `• #${o.order_code} — ${o.client_name} (${o.delivery_status}) — $${Number(o.value_to_collect || 0).toLocaleString('es-CO')}`)
          .join('\n');
        parsed.action = 'chat';
        parsed.needs_confirmation = false;
        parsed.message = `Hay varios pedidos que coinciden, no edité ninguno para no equivocarme. ¿Cuál es? Dame el código:\n${list}`;
      } else {
        const order = resolution.item;
        const changedFields = Object.keys(safeUpdates).join(', ');
        // Propuesta: el cliente aplica el UPDATE por id tras confirmar.
        parsed.data = { order_id: order.id, order_code: order.order_code, client_name: order.client_name, updates: safeUpdates };
        parsed.needs_confirmation = true;
        parsed.message = `Voy a actualizar el pedido #${order.order_code} de ${order.client_name} (${changedFields}). ¿Confirmás?`;
      }
    }

    // Desglose de gastos por categoría (read).
    if (parsed.action === 'expense_totals_by_category') {
      const d = parsed.data || {};
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const range = resolveDateRange(d.date_from, d.date_to, today);
      let from: string, to: string;
      if (range) {
        from = range.from; to = range.to;
      } else {
        const m = Number(d.month) || (now.getMonth() + 1);
        const y = Number(d.year) || now.getFullYear();
        from = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      }
      const { data: rows, error } = await supabase.from('expenses').select('category, amount')
        .gte('expense_date', from).lte('expense_date', to);
      if (error) {
        parsed.message = 'No pude calcular los gastos en este momento. Inténtalo de nuevo.';
        parsed.results = [];
      } else {
        const totals: Record<string, number> = {};
        let grand = 0;
        for (const e of (rows || []) as Array<Record<string, unknown>>) {
          const c = String(e.category || 'otro');
          const a = Number(e.amount) || 0;
          totals[c] = (totals[c] || 0) + a;
          grand += a;
        }
        const arr = Object.entries(totals).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
        if (!arr.length) {
          parsed.message = `No hay gastos registrados entre ${from} y ${to}.`;
          parsed.results = [];
        } else {
          const lines = arr.map((x) => `• ${x.category}: $${x.total.toLocaleString('es-CO')}`).join('\n');
          parsed.message = `Gastos del ${from} al ${to} por categoría:\n${lines}\n\nTotal: $${grand.toLocaleString('es-CO')}`;
          parsed.results = []; // el desglose va en el mensaje (no como botones)
        }
      }
    }

    // Editar gasto: RESUELVE y PROPONE (el cliente aplica el UPDATE por id tras confirmar).
    if (parsed.action === 'edit_expense') {
      const d = parsed.data || {};
      let query = supabase.from('expenses').select('*');
      if (d.expense_id) query = query.eq('id', Number(d.expense_id));
      else {
        if (d.description) query = query.ilike('description', `%${d.description}%`);
        if (d.amount) query = query.eq('amount', Number(d.amount));
        if (d.expense_date) query = query.eq('expense_date', String(d.expense_date));
      }
      const { data: found, error } = await query.order('created_at', { ascending: false }).limit(5);
      const updatesRaw = (d.updates || {}) as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(updatesRaw)) {
        if ((EDITABLE_EXPENSE_FIELDS as readonly string[]).includes(k)) safe[k] = v;
      }
      const resolution = error ? { kind: 'none' as const } : resolveSingleMatch(found);
      parsed.confirmed = false;
      if (Object.keys(safe).length === 0) {
        parsed.action = 'chat'; parsed.needs_confirmation = false;
        parsed.message = 'No identifiqué qué cambiar del gasto. Ej: "el arriendo eran 850 mil".';
      } else if (resolution.kind === 'none') {
        parsed.action = 'chat'; parsed.needs_confirmation = false;
        parsed.message = error ? 'No pude buscar el gasto. Inténtalo de nuevo.' : 'No encontré ese gasto. Dime la descripción o el monto.';
      } else if (resolution.kind === 'ambiguous') {
        const list = resolution.candidates.map((e) => `• ${e.description} — $${Number(e.amount || 0).toLocaleString('es-CO')} (${e.expense_date})`).join('\n');
        parsed.action = 'chat'; parsed.needs_confirmation = false;
        parsed.message = `Hay varios gastos que coinciden, no edité ninguno. ¿Cuál?\n${list}`;
      } else {
        const exp = resolution.item;
        parsed.data = { expense_id: exp.id, description: exp.description, updates: safe };
        parsed.needs_confirmation = true;
        parsed.message = `Voy a actualizar el gasto "${exp.description}" (${Object.keys(safe).join(', ')}). ¿Confirmás?`;
      }
    }

    // Listar alertas abiertas del propio negocio (read). El cliente scoped service
    // ya filtra por tenant_id (guard) y el service role evita la RLS deny-anon.
    if (parsed.action === 'search_alerts') {
      const { data: rows, error } = await supabase.from('alerts')
        .select('id, kind, severity, title, message, created_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(SEARCH_LIMIT);
      if (error) {
        parsed.message = 'No pude consultar las alertas en este momento. Inténtalo de nuevo.';
        parsed.results = [];
      } else if (!rows?.length) {
        parsed.message = 'No tienes alertas abiertas. Todo en orden 👌';
        parsed.results = [];
      } else {
        const lines = rows.map((a: Record<string, unknown>) => `• ${a.title}${a.message ? ` — ${a.message}` : ''}`).join('\n');
        parsed.message = `Tienes ${rows.length} alerta(s) abierta(s)${moreHint(rows.length)}:\n${lines}`;
        parsed.results = []; // la lista va en el mensaje (no como botones)
      }
    }

    // Resolver alerta: RESUELVE y PROPONE; el cliente confirma vía PATCH /api/alerts.
    if (parsed.action === 'resolve_alert') {
      const d = parsed.data || {};
      let query = supabase.from('alerts').select('id, title, message').is('resolved_at', null);
      if (d.alert_id) query = query.eq('id', Number(d.alert_id));
      else if (d.title) query = query.ilike('title', `%${d.title}%`);
      const { data: found, error } = await query.order('created_at', { ascending: false }).limit(5);
      const resolution = error ? { kind: 'none' as const } : resolveSingleMatch(found);
      parsed.confirmed = false;
      if (resolution.kind === 'none') {
        parsed.action = 'chat'; parsed.needs_confirmation = false;
        parsed.message = error ? 'No pude consultar las alertas. Inténtalo de nuevo.' : 'No encontré una alerta abierta que coincida.';
      } else if (resolution.kind === 'ambiguous') {
        const list = resolution.candidates.map((a) => `• ${a.title}`).join('\n');
        parsed.action = 'chat'; parsed.needs_confirmation = false;
        parsed.message = `Hay varias alertas que coinciden, ¿cuál marco como resuelta?\n${list}`;
      } else {
        const al = resolution.item;
        parsed.data = { alert_id: al.id, title: al.title };
        parsed.needs_confirmation = true;
        parsed.message = `Voy a marcar como resuelta la alerta "${al.title}". ¿Confirmás?`;
      }
    }

    // Reimprimir la guía de un pedido existente (read): devuelve los campos que
    // consume la GuideCard; el cliente la muestra con setShowGuide.
    if (parsed.action === 'reprint_order_guide') {
      const d = parsed.data || {};
      let query = supabase.from('orders').select('*');
      if (d.order_code) query = query.eq('order_code', String(d.order_code));
      else if (d.client_name) query = query.ilike('client_name', `%${d.client_name}%`);
      const { data: found, error } = await query.order('created_at', { ascending: false }).limit(5);
      const resolution = error ? { kind: 'none' as const } : resolveSingleMatch(found);
      if (resolution.kind === 'none') {
        parsed.action = 'chat';
        parsed.message = error ? 'No pude buscar el pedido. Inténtalo de nuevo.' : 'No encontré ese pedido. Dame el código o el nombre del cliente.';
      } else if (resolution.kind === 'ambiguous') {
        const list = resolution.candidates.map((o) => `• #${o.order_code} — ${o.client_name} (${o.delivery_status})`).join('\n');
        parsed.action = 'chat';
        parsed.message = `Hay varios pedidos que coinciden, ¿cuál? Dame el código:\n${list}`;
      } else {
        const o = resolution.item;
        parsed.data = {
          order_code: o.order_code, client_name: o.client_name, phone: o.phone, address: o.address,
          complement: o.complement, product_ref: o.product_ref, detail: o.detail,
          value_to_collect: o.value_to_collect, comment: o.comment,
          payment_timing: o.payment_timing, prepaid_amount: o.prepaid_amount,
        };
        parsed.message = `Aquí está la guía del pedido #${o.order_code} de ${o.client_name}.`;
      }
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Error desconocido';
    console.error('AI assistant error:', msg);
    return NextResponse.json({ error: 'No se pudo procesar la solicitud' }, { status: 500 });
  }
}
