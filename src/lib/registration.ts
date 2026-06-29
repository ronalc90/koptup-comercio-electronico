/**
 * Lógica PURA (sin IO, testeable) del auto-registro. Dos modos:
 *   A) Negocio nuevo (crea tenant + admin) → aprueba el superadmin.
 *   B) Empleado a un negocio existente (vía invite_code) → aprueba el admin.
 *
 * La validación de contraseña vive en auth.ts (validatePassword) y la aplica el
 * endpoint; aquí validamos identidad/negocio y normalizamos datos.
 */

export interface IndustryPreset {
  label: string;
  categories: string[];
}

/** Catálogo de industrias sugeridas → categorías por defecto. "otro" = genérico. */
export const INDUSTRY_PRESETS: Record<string, IndustryPreset> = {
  calzado: { label: 'Calzado y moda', categories: ['Zapatos', 'Sandalias', 'Bolsos', 'Accesorios'] },
  motos: { label: 'Motos y repuestos', categories: ['Cascos', 'Repuestos', 'Accesorios', 'Lubricantes'] },
  ropa: { label: 'Ropa y textil', categories: ['Camisetas', 'Pantalones', 'Vestidos', 'Accesorios'] },
  hogar: { label: 'Hogar y decoración', categories: ['Cocina', 'Decoración', 'Organización', 'Textiles'] },
  tecnologia: { label: 'Tecnología', categories: ['Celulares', 'Accesorios', 'Computación', 'Audio'] },
  alimentos: { label: 'Alimentos y bebidas', categories: ['Snacks', 'Bebidas', 'Despensa', 'Congelados'] },
  belleza: { label: 'Belleza y cuidado', categories: ['Maquillaje', 'Cuidado piel', 'Cabello', 'Perfumería'] },
  ferreteria: { label: 'Ferretería', categories: ['Herramientas', 'Eléctricos', 'Plomería', 'Pinturas'] },
  otro: { label: 'Otro', categories: ['General', 'Otro'] },
};

export const INDUSTRY_KEYS = Object.keys(INDUSTRY_PRESETS);

export function isKnownIndustry(v: unknown): v is string {
  return typeof v === 'string' && v in INDUSTRY_PRESETS;
}

export function defaultCategoriesForIndustry(industry: string): string[] {
  return (INDUSTRY_PRESETS[industry] ?? INDUSTRY_PRESETS.otro).categories;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: unknown): boolean {
  return typeof s === 'string' && EMAIL_RE.test(s.trim());
}

/** Slug a partir del nombre del negocio (a-z, 0-9 y guiones). */
export function slugify(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Normaliza la lista de categorías (strings no vacíos, ≤40 chars, máx 40, sin duplicados). */
export function sanitizeCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const c = raw.trim().slice(0, 40);
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
    if (out.length >= 40) break;
  }
  return out;
}

function isFilled(v: unknown, min = 1, max = 200): boolean {
  return typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;
}

export interface BusinessRegistrationInput {
  businessName?: unknown;
  industry?: unknown;
  contactEmail?: unknown;
  phone?: unknown;
  adminName?: unknown;
  adminEmail?: unknown;
  acceptedTerms?: unknown;
}

/**
 * Valida el registro de NEGOCIO NUEVO (modo A). Devuelve mensaje de error o null.
 * La contraseña la valida el endpoint con validatePassword (auth.ts).
 */
export function validateBusinessRegistration(b: BusinessRegistrationInput): string | null {
  if (!isFilled(b.businessName, 2, 60)) return 'El nombre del negocio es obligatorio (2 a 60 caracteres).';
  if (!slugify(String(b.businessName))) return 'El nombre del negocio no es válido.';
  if (!isKnownIndustry(b.industry)) return 'Selecciona un tipo de negocio válido.';
  if (!isValidEmail(b.contactEmail)) return 'El email de contacto no es válido.';
  if (!isFilled(b.phone, 7, 20)) return 'El teléfono de contacto es obligatorio.';
  if (!isFilled(b.adminName, 2, 60)) return 'El nombre del responsable es obligatorio.';
  if (!isValidEmail(b.adminEmail)) return 'El email del administrador no es válido.';
  if (b.acceptedTerms !== true) return 'Debes aceptar los términos para continuar.';
  return null;
}

export interface InviteRegistrationInput {
  inviteCode?: unknown;
  name?: unknown;
  email?: unknown;
  acceptedTerms?: unknown;
}

/** Valida el registro de EMPLEADO (modo B). Devuelve mensaje de error o null. */
export function validateInviteRegistration(b: InviteRegistrationInput): string | null {
  if (!isFilled(b.inviteCode, 4, 32)) return 'El código de invitación es obligatorio.';
  if (!isFilled(b.name, 2, 60)) return 'Tu nombre es obligatorio.';
  if (!isValidEmail(b.email)) return 'El email no es válido.';
  if (b.acceptedTerms !== true) return 'Debes aceptar los términos para continuar.';
  return null;
}
