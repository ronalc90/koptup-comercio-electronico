/**
 * Constantes compartidas del asistente (chat). Centralizan el contrato de
 * acciones y los enums de negocio para que la UI, el route y los validadores
 * usen UNA sola fuente de verdad (evita la dispersión de reglas detectada en la
 * auditoría: validación distinta entre UI, asistente y REST).
 */

/** Estados válidos del pipeline de un pedido. Debe coincidir con el CHECK
 * `chk_orders_status` de la BD (migración 009). */
export const ORDER_STATUSES = [
  'Confirmado',
  'Enviado',
  'Entregado',
  'Pagado',
  'Devolucion',
  'Cancelado',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Estados que cuentan como venta "activa" para ingresos/utilidad. Excluye
 * Devolucion y Cancelado. Alineado con el cálculo del Dashboard
 * (activeOrders = Confirmado|Enviado|Entregado|Pagado) para que el resumen del
 * chat y el tablero NO se contradigan.
 */
export const ACTIVE_REVENUE_STATUSES: OrderStatus[] = [
  'Confirmado',
  'Enviado',
  'Entregado',
  'Pagado',
];

/** Categorías válidas de un gasto general (deben coincidir con el prompt). */
export const EXPENSE_CATEGORIES = [
  'envío',
  'arriendo',
  'servicios',
  'materiales',
  'empaque',
  'publicidad',
  'otro',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/**
 * Acciones que MODIFICAN datos y por tanto exigen confirmación explícita del
 * usuario antes de ejecutarse. Incluye edit_order (antes se ejecutaba en el
 * servidor sin confirmar) y multi_action.
 */
export const MODIFYING_ACTIONS = [
  'create_order',
  'add_inventory',
  'mark_defective',
  'return_order',
  'update_order_status',
  'register_expense',
  'update_cost',
  'edit_order',
  // v1.041 — el chat ahora hace TODO lo que la app permite:
  'create_product',
  'edit_product',
  'adjust_inventory',
  'move_inventory',
  'edit_expense',
  'resolve_alert',
  'delete_product',
  'multi_action',
] as const;

/**
 * Acciones DESTRUCTIVAS (irreversibles): exigen que la usuaria escriba
 * literalmente "Acepto" para ejecutarse (no basta "sí"/"dale"/botón). Convención
 * de Meraki para borrados irreversibles (igual que el borrado total de cuenta).
 */
export const DESTRUCTIVE_ACTIONS = ['delete_product'] as const;

/** Frase exacta requerida para confirmar una acción destructiva. */
export const DESTRUCTIVE_CONFIRM_PHRASE = 'Acepto';

/** ¿Esta acción exige el gate "Acepto"? */
export function isDestructiveAction(action: string | undefined): boolean {
  return !!action && (DESTRUCTIVE_ACTIONS as readonly string[]).includes(action);
}

/** Campos editables vía edit_order (whitelist, espejo del servidor). */
export const EDITABLE_ORDER_FIELDS = [
  'client_name',
  'phone',
  'address',
  'complement',
  'detail',
  'comment',
  'value_to_collect',
  'product_ref',
  'city',
] as const;

/** Campos editables vía edit_expense (whitelist). NO incluye owner/order_id. */
export const EDITABLE_EXPENSE_FIELDS = [
  'description',
  'amount',
  'category',
  'expense_date',
] as const;

/** Campos editables vía edit_product (whitelist). El code (clave) NO se edita por chat. */
export const EDITABLE_PRODUCT_FIELDS = ['name', 'category', 'cost', 'active'] as const;
