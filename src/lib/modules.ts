/**
 * Registro de módulos (Fase 4 — marketplace de módulos).
 *
 * Define los módulos instalables (los que tienen pantalla). Cada tenant declara
 * qué módulos tiene habilitados (`navModules`) y puede renombrarlos
 * (`moduleLabels`). La navegación se construye a partir de aquí, no hardcodeada,
 * así un tenant puede tener un set distinto sin tocar componentes.
 *
 * Los módulos `core` (dashboard, config) están SIEMPRE habilitados.
 */
export type ModuleKey =
  | 'dashboard'
  | 'pedidos'
  | 'asistente'
  | 'inventario'
  | 'productos'
  | 'despachos'
  | 'agentes'
  | 'config';

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  route: string;
  core?: boolean;
  /** Resaltado visual (el item del asistente). */
  accent?: boolean;
}

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDef> = {
  dashboard: { key: 'dashboard', label: 'Dashboard', route: '/dashboard', core: true },
  pedidos: { key: 'pedidos', label: 'Pedidos', route: '/orders' },
  asistente: { key: 'asistente', label: 'Asistente IA', route: '/assistant', accent: true },
  inventario: { key: 'inventario', label: 'Inventario', route: '/inventory' },
  productos: { key: 'productos', label: 'Productos', route: '/products' },
  despachos: { key: 'despachos', label: 'Despacho', route: '/dispatch' },
  agentes: { key: 'agentes', label: 'Agentes IA', route: '/agents' },
  config: { key: 'config', label: 'Config', route: '/settings', core: true },
};

/** Orden de aparición en la navegación. */
export const MODULE_ORDER: ModuleKey[] = [
  'dashboard', 'pedidos', 'asistente', 'inventario', 'productos', 'despachos', 'agentes', 'config',
];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULE_ORDER.slice();

export function isModuleEnabled(enabled: ModuleKey[] | undefined, key: ModuleKey): boolean {
  if (MODULE_REGISTRY[key].core) return true;
  // Sin lista declarada ⇒ todos habilitados (retrocompat: meraki no cambia).
  if (!enabled) return true;
  return enabled.includes(key);
}

/**
 * Construye los items de navegación para un tenant: módulos habilitados (core
 * siempre), en orden, con el label propio del tenant si lo redefine.
 */
export function tenantNav(
  enabled: ModuleKey[] | undefined,
  labels?: Partial<Record<ModuleKey, string>>,
): ModuleDef[] {
  return MODULE_ORDER
    .filter((k) => isModuleEnabled(enabled, k))
    .map((k) => ({ ...MODULE_REGISTRY[k], label: labels?.[k] ?? MODULE_REGISTRY[k].label }));
}
