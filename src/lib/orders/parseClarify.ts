/**
 * Lógica PURA (testeable, sin IO) del flujo conversacional de aclaración del
 * parseo de pedidos. El LLM extrae el pedido + sus líneas de producto; ESTA capa
 * decide, de forma determinista y validando contra el catálogo/inventario real,
 * si el pedido está completo o si hay que PREGUNTAR algo específico (en vez de
 * adivinar o dejar campos vacíos). Es la red de seguridad por encima del modelo:
 * aunque el LLM diga "complete", si el servidor detecta huecos, manda el servidor.
 */

export type ParseStatus = 'complete' | 'needs_clarification' | 'not_order';

/** Una línea de producto extraída del pedido (para validar variantes). */
export interface ParsedProduct {
  model: string;
  color?: string | null;
  size?: string | null;
  quantity?: number | null;
}

/** Campos planos del pedido (espejo de ParsedOrder). */
export interface ParsedOrderCore {
  client_name?: string | null;
  phone?: string | null;
  address?: string | null;
  complement?: string | null;
  detail?: string | null;
  value_to_collect?: number | null;
  city?: string | null;
  product_ref?: string | null;
  comment?: string | null;
}

export interface ClarifyResult {
  status: ParseStatus;
  /** Claves de lo que falta (para lógica/tests). */
  missing: string[];
  /** Preguntas concretas para el usuario (en orden). */
  questions: string[];
}

/** Disponibilidad de variantes de un modelo, derivada del inventario en stock. */
export interface ModelVariants {
  colors: string[];
  sizes: string[]; // excluye "Única"
  /** combinaciones color|talla EN STOCK, normalizadas (`${color}|${size}`). */
  combos: Set<string>;
}

export interface CatalogIndex {
  /** modelo (en minúsculas) → variantes disponibles. */
  byModel: Map<string, ModelVariants>;
  /** nombres/códigos del catálogo (minúsculas) para reconocer productos. */
  knownModels: string[];
}

function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function comboKey(color: string, size: string): string {
  return `${norm(color)}|${norm(size)}`;
}

/**
 * Construye el índice de catálogo a partir de los productos (catálogo) y el
 * inventario EN STOCK (status "Bueno", quantity > 0). Agrupa colores/tallas y las
 * combinaciones disponibles por modelo.
 */
export function buildCatalogIndex(
  products: Array<{ name?: string | null; code?: string | null }>,
  inventory: Array<{ model?: string | null; color?: string | null; size?: string | null }>,
): CatalogIndex {
  const byModel = new Map<string, ModelVariants>();
  const ensure = (model: string): ModelVariants => {
    const key = norm(model);
    let v = byModel.get(key);
    if (!v) { v = { colors: [], sizes: [], combos: new Set() }; byModel.set(key, v); }
    return v;
  };
  for (const it of inventory) {
    if (!it.model) continue;
    const v = ensure(it.model);
    const color = String(it.color ?? '').trim();
    const size = String(it.size ?? '').trim();
    const sizeIsUnica = !size || norm(size) === 'unica';
    if (color && !v.colors.some((c) => norm(c) === norm(color))) v.colors.push(color);
    if (!sizeIsUnica && !v.sizes.some((s) => norm(s) === norm(size))) v.sizes.push(size);
    v.combos.add(comboKey(color, sizeIsUnica ? '' : size));
  }
  const knownModels = new Set<string>();
  for (const p of products) {
    if (p.name) knownModels.add(norm(p.name));
    if (p.code) knownModels.add(norm(p.code));
  }
  for (const k of byModel.keys()) knownModels.add(k);
  return { byModel, knownModels: [...knownModels] };
}

/** Busca las variantes de un modelo por coincidencia difusa (token/substring). */
export function lookupModel(idx: CatalogIndex, model: string): ModelVariants | null {
  const m = norm(model);
  if (!m) return null;
  if (idx.byModel.has(m)) return idx.byModel.get(m)!;
  // Coincidencia difusa: el modelo del catálogo contiene el término o viceversa.
  for (const [key, v] of idx.byModel) {
    if (key.includes(m) || m.includes(key.split(/\s+/)[0])) return v;
  }
  return null;
}

const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo'];
function ordinal(i: number): string {
  return ORDINALS[i] ?? `${i + 1}º`;
}

/** Etiqueta para referirse a un producto cuando hay varios del mismo modelo. */
function productLabel(p: ParsedProduct, indexAmongSameModel: number | null): string {
  const model = p.model || 'producto';
  if (indexAmongSameModel === null) return `el ${model}`;
  return `el ${ordinal(indexAmongSameModel)} ${model}`;
}

/** Faltantes de los campos OBLIGATORIOS de despacho. */
export function requiredFieldGaps(order: ParsedOrderCore): ClarifyResult {
  const missing: string[] = [];
  const questions: string[] = [];
  const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

  if (!has(order.client_name)) { missing.push('client_name'); questions.push('¿A nombre de quién es el pedido?'); }
  if (!has(order.address)) { missing.push('address'); questions.push('¿Cuál es la dirección de entrega?'); }
  if (!has(order.phone)) { missing.push('phone'); questions.push('¿Cuál es el teléfono del cliente?'); }
  const val = Number(order.value_to_collect);
  if (!Number.isFinite(val) || val <= 0) { missing.push('value_to_collect'); questions.push('¿Cuánto se le cobra al cliente (valor a cobrar)?'); }
  return { status: missing.length ? 'needs_clarification' : 'complete', missing, questions };
}

/** Tallas disponibles para un color dado, según las combinaciones en stock. */
function sizesForColor(v: ModelVariants, color: string): string[] {
  const c = norm(color);
  return v.sizes.filter((s) => v.combos.has(comboKey(c, s)));
}

/**
 * Faltantes/ambigüedades de las VARIANTES de los productos, validando contra el
 * inventario. Si hay varios productos del mismo modelo, las preguntas referencian
 * cuál ("el tercer pantufla"). Si un color/talla/combinación no existe, ofrece los
 * disponibles. Solo valida atributos cuando el modelo realmente los usa.
 */
export function productGaps(products: ParsedProduct[], idx: CatalogIndex): ClarifyResult {
  const missing: string[] = [];
  const questions: string[] = [];

  // Cuenta cuántas LÍNEAS hay de cada modelo para decidir si etiquetar por ordinal.
  const countByModel = new Map<string, number>();
  for (const p of products) countByModel.set(norm(p.model), (countByModel.get(norm(p.model)) ?? 0) + 1);
  const seenOfModel = new Map<string, number>();

  for (const p of products) {
    if (!p.model || !p.model.trim()) {
      missing.push('product'); questions.push('¿Qué producto(s) lleva el pedido?');
      continue;
    }
    const total = countByModel.get(norm(p.model)) ?? 1;
    const ord = total > 1 ? (seenOfModel.get(norm(p.model)) ?? 0) : null;
    seenOfModel.set(norm(p.model), (seenOfModel.get(norm(p.model)) ?? 0) + 1);
    const label = productLabel(p, ord);

    const v = lookupModel(idx, p.model);
    if (!v) {
      // Modelo no reconocido en catálogo/inventario → confirmar (no adivinar).
      missing.push('product_unknown');
      questions.push(`No reconozco "${p.model}" en el catálogo. ¿Puedes confirmar el nombre o código del producto?`);
      continue;
    }
    const color = String(p.color ?? '').trim();
    const size = String(p.size ?? '').trim();

    let colorOk = true;
    let sizeOk = true;

    // Color: si el modelo tiene >1 color disponible y no se dijo → preguntar.
    if (!color && v.colors.length > 1) {
      colorOk = false;
      missing.push('color');
      questions.push(`¿De qué color es ${label}? Disponibles: ${v.colors.join(', ')}.`);
    } else if (color && v.colors.length > 0 && !v.colors.some((c) => norm(c) === norm(color))) {
      colorOk = false;
      missing.push('color_invalid');
      questions.push(`No tengo "${color}" de ${p.model}. Disponibles: ${v.colors.join(', ')}. ¿Cuál prefieres?`);
    }

    // Talla: igual criterio.
    if (!size && v.sizes.length > 1) {
      sizeOk = false;
      missing.push('size');
      questions.push(`¿Qué talla es ${label}? Disponibles: ${v.sizes.join(', ')}.`);
    } else if (size && v.sizes.length > 0 && !v.sizes.some((s) => norm(s) === norm(size))) {
      sizeOk = false;
      missing.push('size_invalid');
      questions.push(`No tengo talla "${size}" de ${p.model}. Disponibles: ${v.sizes.join(', ')}. ¿Cuál prefieres?`);
    }

    // Combinación color+talla: ambos válidos por separado pero la COMBINACIÓN no
    // existe / está agotada (ej. hay talla 40 en miel y color negro en 38, pero no
    // "40 negra"). Solo aplica cuando el modelo usa color Y talla.
    if (colorOk && sizeOk && color && size && v.colors.length > 0 && v.sizes.length > 0
        && !v.combos.has(comboKey(color, size))) {
      missing.push('combo_unavailable');
      const altSizes = sizesForColor(v, color);
      const hint = altSizes.length
        ? `En ${color} tengo tallas: ${altSizes.join(', ')}.`
        : `Combinaciones disponibles de ${p.model}: ${[...v.combos].map(formatCombo).filter(Boolean).join('; ')}.`;
      questions.push(`No tengo ${p.model} ${color} en talla ${size}. ${hint} ¿Cuál prefieres?`);
    }
  }
  return { status: missing.length ? 'needs_clarification' : 'complete', missing, questions };
}

function formatCombo(key: string): string {
  const [c, s] = key.split('|');
  if (c && s) return `${c} talla ${s}`;
  if (c) return c;
  if (s) return `talla ${s}`;
  return '';
}

/**
 * Decisión final: combina lo que pidió el LLM + las validaciones server-side de
 * campos obligatorios y variantes. Si el LLM dijo "complete" pero el servidor
 * detecta huecos, se degrada a needs_clarification (el servidor manda).
 */
export function decideClarification(
  llm: { status?: string; order?: ParsedOrderCore; products?: ParsedProduct[]; questions?: string[] },
  idx: CatalogIndex,
): ClarifyResult {
  if (llm.status === 'not_order') {
    return { status: 'not_order', missing: [], questions: [] };
  }
  const order = llm.order ?? {};
  const products = Array.isArray(llm.products) ? llm.products : [];

  const req = requiredFieldGaps(order);
  // Si no se extrajo ningún producto, pídelo.
  const prodReq: ClarifyResult = products.length === 0
    ? { status: 'needs_clarification', missing: ['product'], questions: ['¿Qué producto(s) lleva el pedido?'] }
    : productGaps(products, idx);

  // Preguntas: server-side primero (obligatorios → variantes), luego las que el
  // LLM haya añadido y no estén ya cubiertas. Dedupe por texto normalizado.
  const merged: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => { const k = norm(q); if (q.trim() && !seen.has(k)) { seen.add(k); merged.push(q.trim()); } };
  [...req.questions, ...prodReq.questions, ...(llm.questions ?? [])].forEach(push);

  const missing = [...req.missing, ...prodReq.missing];
  return {
    status: missing.length || merged.length ? 'needs_clarification' : 'complete',
    missing,
    questions: merged,
  };
}

/**
 * Compone un `detail` legible (compatible con el modelo de orden de un solo
 * producto que persiste la app) a partir de las líneas de producto estructuradas.
 */
export function composeDetail(products: ParsedProduct[]): string {
  return products
    .filter((p) => p && p.model && p.model.trim())
    .map((p) => {
      const qty = Number(p.quantity);
      const prefix = Number.isFinite(qty) && qty > 1 ? `${qty} x ` : '';
      const size = p.size ? ` talla ${String(p.size).trim()}` : '';
      const color = p.color ? ` ${String(p.color).trim()}` : '';
      return `${prefix}${p.model.trim()}${size}${color}`.trim();
    })
    .join(', ');
}
