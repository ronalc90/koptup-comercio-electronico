/**
 * Configuración estática por tenant: marca, tema, categorías, módulos y
 * especialización de IA. Mantener en código (no en BD) la parte que el front
 * necesita de forma síncrona para pintar la marca sin parpadeo. La BD guarda
 * la fila `tenants` (estado, logo subido, etc.); esto es el default de diseño.
 *
 * Se indexa por `slug`. Si un slug no existe, se cae al de meraki.
 */
import { DEFAULT_TENANT_SLUG } from './tenant';

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
  theme: TenantTheme;
  /** Categorías de producto propias del negocio. */
  categories: string[];
  /** Módulos habilitados para este tenant. */
  modules: string[];
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

export function getTenantConfig(slug: string | null | undefined): TenantConfig {
  if (slug && TENANT_CONFIGS[slug]) return TENANT_CONFIGS[slug];
  return TENANT_CONFIGS[DEFAULT_TENANT_SLUG];
}

/** Slugs conocidos por la app (para validación y seeds). */
export const KNOWN_TENANT_SLUGS = Object.keys(TENANT_CONFIGS);
