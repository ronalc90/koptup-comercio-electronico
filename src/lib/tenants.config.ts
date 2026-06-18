/**
 * Configuración estática por tenant: marca, tema, categorías, módulos y
 * especialización de IA. Mantener en código (no en BD) la parte que el front
 * necesita de forma síncrona para pintar la marca sin parpadeo. La BD guarda
 * la fila `tenants` (estado, logo subido, etc.); esto es el default de diseño.
 *
 * Se indexa por `slug`. Si un slug no existe, se cae al de meraki.
 */
import { DEFAULT_TENANT_SLUG } from './tenant';
import type { ModuleKey } from './modules';

export interface TenantTheme {
  /** Color primario de marca (botones, acentos). */
  primary: string;
  primaryDark: string;
  primaryLight: string;
  /** Gradiente de cabecera/login. */
  gradient: string;
}

export interface TenantConfig {
  slug: string;
  name: string;
  /** Emoji o URL de logo. */
  logo: string;
  tagline: string;
  /** Teléfono de contacto del negocio (se muestra en Configuración). */
  phone?: string;
  theme: TenantTheme;
  /** Categorías de producto propias del negocio. */
  categories: string[];
  /** Módulos conceptuales del negocio (para reportes/QA). */
  modules: string[];
  /**
   * Módulos con pantalla habilitados en la navegación. `undefined` ⇒ todos
   * (retrocompat). Los módulos core (dashboard, config) van siempre.
   */
  navModules?: ModuleKey[];
  /** Renombres de módulos en la navegación, propios del tenant. */
  moduleLabels?: Partial<Record<ModuleKey, string>>;
  /** Especialización del asistente de IA. */
  ai: {
    /** Dominio en una palabra (para prompts). */
    domain: string;
    /** Instrucción de sistema base para el asistente del tenant. */
    systemPrompt: string;
    /** Pistas de captura de pedidos específicas del negocio. */
    captureHints: string;
  };
}

export const TENANT_CONFIGS: Record<string, TenantConfig> = {
  meraki: {
    slug: 'meraki',
    name: 'Tu Tienda Meraki',
    logo: '🩴',
    tagline: 'Gestión de pedidos y despachos',
    phone: '3203880422',
    theme: {
      primary: '#7c3aed',
      primaryDark: '#5b21b6',
      primaryLight: '#a78bfa',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 50%, #a78bfa 100%)',
    },
    categories: ['Pantuflas', 'Maxisacos', 'Bolsos', 'Pocillos'],
    modules: ['pedidos', 'inventario', 'despachos', 'dashboard', 'asistente'],
    ai: {
      domain: 'pantuflas y artículos para el hogar',
      systemPrompt:
        'Eres el asistente de Tu Tienda Meraki, una tienda de pantuflas, maxisacos, ' +
        'bolsos y pocillos. Reconoces tallas, colores y modelos de pantuflas. Ayudas a ' +
        'capturar pedidos, consultar inventario y entender el negocio.',
      captureHints:
        'Identifica talla (ej. 35-40), color y modelo de pantufla. Para maxisacos identifica ' +
        'tamaño y estampado. Extrae nombre de cliente, teléfono, dirección y valor a cobrar.',
    },
  },

  primeramayo: {
    slug: 'primeramayo',
    name: 'PrimeraMayo',
    logo: '🏍️',
    tagline: 'Todo para tu motocicleta',
    theme: {
      primary: '#dc2626',
      primaryDark: '#991b1b',
      primaryLight: '#f87171',
      gradient: 'linear-gradient(135deg, #dc2626 0%, #ea580c 50%, #f59e0b 100%)',
    },
    categories: [
      'Cascos',
      'Repuestos',
      'Accesorios',
      'Lubricantes',
      'Guantes',
      'Impermeables',
      'Maleteros',
      'Luces LED',
      'Protección',
    ],
    modules: [
      'inventario',
      'catalogo',
      'compras',
      'ventas',
      'garantias',
      'proveedores',
      'dashboard',
      'asistente',
    ],
    // Nav con vocabulario de motos: el catálogo es "Catálogo" y los pedidos
    // son "Ventas". Mismas pantallas, etiquetas propias del negocio.
    navModules: ['pedidos', 'asistente', 'inventario', 'productos', 'despachos', 'agentes'],
    moduleLabels: { productos: 'Catálogo', pedidos: 'Ventas' },
    ai: {
      domain: 'motocicletas, cascos y repuestos',
      systemPrompt:
        'Eres el asistente de PrimeraMayo, una tienda de cascos, repuestos, accesorios, ' +
        'lubricantes, guantes, impermeables, maleteros, luces LED y protección para ' +
        'motociclistas. Reconoces referencias de cascos y repuestos, marcas y modelos de ' +
        'motocicleta, y sugieres compatibilidades entre repuestos y modelos de moto.',
      captureHints:
        'Identifica referencia y marca del casco/repuesto, modelo de motocicleta compatible ' +
        '(ej. Pulsar NS200, Boxer CT100, AKT 125), talla del casco (S/M/L/XL) y certificación. ' +
        'Para repuestos sugiere compatibilidad con el modelo de moto del cliente.',
    },
  },
};

/**
 * Default GENÉRICO para negocios creados en runtime (slug no conocido en código).
 * Antes esos negocios caían a la config de Meraki (pantuflas); ahora arrancan
 * con algo neutro y luego el superadmin personaliza categorías/marca/IA, que se
 * guardan en la BD (columna `tenants.config`) y se mezclan con este base.
 */
export const GENERIC_TENANT_CONFIG: TenantConfig = {
  slug: 'generic',
  name: 'Mi Negocio',
  logo: '🏪',
  tagline: 'Gestión de pedidos y catálogo',
  theme: {
    primary: '#7c3aed',
    primaryDark: '#5b21b6',
    primaryLight: '#a78bfa',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 50%, #a78bfa 100%)',
  },
  categories: ['General', 'Otro'],
  modules: ['pedidos', 'inventario', 'despachos', 'dashboard', 'asistente'],
  ai: {
    domain: 'productos y pedidos',
    systemPrompt:
      'Eres el asistente de {name}. Ayudas a capturar pedidos, consultar inventario ' +
      'y entender el negocio. Reconoces productos, cantidades, precios y los datos del ' +
      'cliente (nombre, teléfono, dirección) y el valor a cobrar.',
    captureHints:
      'Extrae nombre del cliente, teléfono, dirección, los productos con su cantidad y ' +
      'el valor a cobrar.',
  },
};

export function getTenantConfig(slug: string | null | undefined): TenantConfig {
  if (slug && TENANT_CONFIGS[slug]) return TENANT_CONFIGS[slug];
  // Slug desconocido (negocio creado en runtime) ⇒ base genérico, NO Meraki.
  return GENERIC_TENANT_CONFIG;
}

/**
 * Override por-tenant guardado en BD (`tenants.config`, jsonb). Todo opcional:
 * lo que no venga se hereda del base (config estática del slug o el genérico).
 */
export interface TenantConfigOverrides {
  categories?: string[];
  tagline?: string;
  phone?: string;
  logo?: string;
  modules?: string[];
  navModules?: ModuleKey[];
  moduleLabels?: Partial<Record<ModuleKey, string>>;
  theme?: Partial<TenantTheme>;
  ai?: Partial<TenantConfig['ai']>;
}

/**
 * Config EFECTIVA de un negocio: base (estática del slug si existe, o genérica)
 * + overrides de la BD + nombre/logo reales. Es lo que la app debe usar para
 * pintar marca, categorías y especializar la IA.
 */
export function resolveTenantConfig(
  slug: string | null | undefined,
  overrides?: TenantConfigOverrides | null,
  name?: string | null,
  logo?: string | null,
): TenantConfig {
  const base = slug && TENANT_CONFIGS[slug] ? TENANT_CONFIGS[slug] : GENERIC_TENANT_CONFIG;
  const o = overrides ?? {};
  const merged: TenantConfig = {
    ...base,
    slug: slug || base.slug,
    name: name || base.name,
    logo: logo || o.logo || base.logo,
    tagline: o.tagline ?? base.tagline,
    phone: o.phone ?? base.phone,
    categories: o.categories && o.categories.length > 0 ? o.categories : base.categories,
    modules: o.modules ?? base.modules,
    navModules: o.navModules ?? base.navModules,
    moduleLabels: o.moduleLabels ?? base.moduleLabels,
    theme: { ...base.theme, ...(o.theme ?? {}) },
    ai: { ...base.ai, ...(o.ai ?? {}) },
  };
  // El default genérico usa {name} en el prompt; lo interpolamos con el real.
  if (merged.ai.systemPrompt.includes('{name}')) {
    merged.ai = {
      ...merged.ai,
      systemPrompt: merged.ai.systemPrompt.split('{name}').join(merged.name),
    };
  }
  return merged;
}

/** Slugs conocidos por la app (para validación y seeds). */
export const KNOWN_TENANT_SLUGS = Object.keys(TENANT_CONFIGS);
