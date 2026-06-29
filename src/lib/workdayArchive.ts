/**
 * Archivo de días de trabajo (chat del asistente).
 * Cada "día" es una conversación guardada con su fecha y resumen.
 * Persistencia en localStorage (mismo alcance que el chat activo).
 */

const STORAGE_KEY = 'koptup-workdays';
const LEGACY_STORAGE_KEY = 'meraki-workdays'; // se lee como respaldo (pre-rebrand)
const MAX_ARCHIVES = 60;

export interface ArchivedMessage {
  role: 'user' | 'assistant';
  content: string;
  action?: string;
  confirmed?: boolean;
}

export interface Workday {
  id: string;
  savedAt: string;
  label: string;
  summary: string;
  messageCount: number;
  messages: ArchivedMessage[];
}

function sanitize(messages: unknown[]): ArchivedMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m): m is ArchivedMessage => {
      if (!m || typeof m !== 'object') return false;
      const r = (m as { role?: unknown }).role;
      const c = (m as { content?: unknown }).content;
      return (r === 'user' || r === 'assistant') && typeof c === 'string';
    })
    .map((m) => ({
      role: m.role,
      content: m.content,
      action: typeof m.action === 'string' ? m.action : undefined,
      confirmed: typeof m.confirmed === 'boolean' ? m.confirmed : undefined,
    }));
}

function buildLabel(d: Date): string {
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

function buildSummary(msgs: ArchivedMessage[]): string {
  const firstUser = msgs.find((m) => m.role === 'user');
  const actions = new Set(msgs.map((m) => m.action).filter(Boolean));
  const parts: string[] = [];
  if (firstUser) {
    const trimmed = firstUser.content.trim();
    parts.push(trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed);
  }
  if (actions.size > 0) parts.push(`${actions.size} acción(es)`);
  return parts.join(' · ') || 'Conversación sin texto';
}

export function listWorkdays(): Workday[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is Workday =>
        w && typeof w.id === 'string' && Array.isArray(w.messages),
    );
  } catch {
    return [];
  }
}

export function saveWorkday(messages: unknown[]): Workday | null {
  if (typeof window === 'undefined') return null;
  const clean = sanitize(messages);
  if (clean.length === 0) return null;
  const now = new Date();
  // Sufijo aleatorio para evitar colisiones si se guardan dos workdays
  // dentro del mismo milisegundo (ej: en tests, o guardados rápidos).
  const suffix = Math.random().toString(36).slice(2, 8);
  const entry: Workday = {
    id: `wd_${now.getTime()}_${suffix}`,
    savedAt: now.toISOString(),
    label: buildLabel(now),
    summary: buildSummary(clean),
    messageCount: clean.length,
    messages: clean,
  };
  const existing = listWorkdays();
  const next = [entry, ...existing].slice(0, MAX_ARCHIVES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return entry;
  } catch {
    return null;
  }
}

export function getWorkday(id: string): Workday | null {
  return listWorkdays().find((w) => w.id === id) ?? null;
}

export function deleteWorkday(id: string): void {
  if (typeof window === 'undefined') return;
  const next = listWorkdays().filter((w) => w.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

const MONTH_MAP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Matches a natural-language reference to an archived day.
 * Examples: "15 de abril", "ayer", "el día anterior", "lunes".
 * Returns the most recent archive that fits the reference.
 */
export function findWorkdayByQuery(query: string): Workday | null {
  const archives = listWorkdays();
  if (archives.length === 0) return null;
  const q = stripAccents(query);

  if (/\b(ultim[oa]|mas reciente|anterior|previo|ayer)\b/.test(q)) {
    return archives[0];
  }

  const dm = q.match(/(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de|del)\s+(\d{4}))?/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const monthName = dm[2];
    const year = dm[3] ? parseInt(dm[3], 10) : undefined;
    const month = MONTH_MAP[monthName];
    if (month) {
      return (
        archives.find((w) => {
          const d = new Date(w.savedAt);
          return (
            d.getDate() === day &&
            d.getMonth() + 1 === month &&
            (year === undefined || d.getFullYear() === year)
          );
        }) ?? null
      );
    }
  }

  const iso = q.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return (
      archives.find((w) => w.savedAt.startsWith(`${y}-${m}-${d}`)) ?? null
    );
  }

  return null;
}

/**
 * True when the user's free text looks like a request to open the archive
 * or restore a specific saved day.
 */
export function detectArchiveIntent(
  text: string,
): { kind: 'list' | 'restore'; query?: string } | null {
  const t = stripAccents(text.trim());
  if (!t) return null;
  const openList = /\b(abr[ie]r?|mostrar?|muestra(me)?|ver|listar?|lista)\b.*\b(librito|libro|dias guardados|historial|archivo|dias anteriores)\b/;
  if (openList.test(t)) return { kind: 'list' };
  const restore = /\b(restaur[ae]r?|recuper[ae]r?|carg[ae]r?|trae(me)?|abrir?)\b.*\b(chat|conversacion|dia|charla|historial)\b/;
  if (restore.test(t)) return { kind: 'restore', query: t };
  return null;
}
