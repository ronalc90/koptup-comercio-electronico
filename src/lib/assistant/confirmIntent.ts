/**
 * Detección determinista (sin IA) de confirmación/cancelación cuando hay una
 * acción pendiente. El núcleo del chat es "habla en tus palabras": la usuaria
 * confirma diciendo "sí, dale" en vez de tocar el botón. Antes ese texto iba al
 * LLM, que devolvía {action:'confirm'} y NADIE lo ejecutaba → la acción quedaba
 * colgada. Aquí lo resolvemos localmente y solo cuando hay pendingAction, de
 * modo que un falso positivo es de bajo riesgo (la usuaria puede corregir).
 *
 * Para evitar disparar con mensajes que aportan información ("sí, pero cambia la
 * dirección", "no tengo el costo"), SOLO se interpreta como intención de
 * confirmar/cancelar cuando TODOS los tokens del mensaje pertenecen al léxico
 * afirmativo (o negativo), salvo muletillas. Cualquier palabra fuera de ese
 * léxico ⇒ se manda al LLM como mensaje normal.
 */

export type ConfirmIntent = 'confirm' | 'reject' | null;

/** Normaliza: minúsculas, sin acentos, sin signos de puntuación. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos (marcas diacríticas combinantes)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // signos → espacio
    .replace(/\s+/g, ' ')
    .trim();
}

// Muletillas que no cambian la intención.
const FILLERS = new Set([
  'por', 'favor', 'porfa', 'porfis', 'pues', 'ya', 'entonces', 'eh',
  'gracias', 'todo', 'bien', 'lo', 'la', 'el', 'esta', 'este', 'esa', 'ese',
]);

const AFFIRMATIVE = new Set([
  'si', 'sii', 'siii', 'sip', 'sisas', 'sisa', 'dale', 'dalee', 'ok', 'oka',
  'okey', 'okay', 'oki', 'listo', 'hazlo', 'hagalo', 'haga', 'ejecuta',
  'ejecutalo', 'confirmo', 'confirmar', 'confirmado', 'confirma', 'confirmalo',
  'correcto', 'perfecto', 'exacto', 'eso', 'claro', 'vale', 'guarda',
  'guardalo', 'guardar', 'sale', 'obvio', 'yes', 'aja', 'afirmativo', 'de',
  'una', 'acepto', 'procede', 'adelante',
]);

const NEGATIVE = new Set([
  'no', 'nop', 'nope', 'nel', 'cancela', 'cancelar', 'cancelalo', 'cancelado',
  'corrige', 'corregir', 'corrijamos', 'espera', 'esperate', 'detente', 'para',
  'parate', 'negativo', 'incorrecto', 'mal', 'mejor', 'devuelve', 'rechaza',
  'rechazar', 'rechazado',
]);

/**
 * Devuelve 'confirm' / 'reject' / null. Mensajes vacíos o con cualquier token
 * fuera del léxico devuelven null (van al LLM). Límite de 5 tokens útiles para
 * no capturar frases largas.
 */
export function detectConfirmIntent(text: string): ConfirmIntent {
  const norm = normalize(text);
  if (!norm) return null;

  const tokens = norm.split(' ').filter((t) => t && !FILLERS.has(t));
  if (tokens.length === 0 || tokens.length > 5) return null;

  let sawAff = false;
  let sawNeg = false;
  for (const t of tokens) {
    const aff = AFFIRMATIVE.has(t);
    const neg = NEGATIVE.has(t);
    if (!aff && !neg) return null; // palabra con contenido ⇒ no es confirmación pura
    if (aff) sawAff = true;
    if (neg) sawNeg = true;
  }

  // "no, mejor cancela" → negativo gana sobre cualquier afirmativo accidental.
  if (sawNeg) return 'reject';
  if (sawAff) return 'confirm';
  return null;
}
