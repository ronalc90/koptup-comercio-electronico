/**
 * Historial de versiones visible desde /settings → Acerca de.
 * El usuario puede tocar la versión para leer qué trajo cada entrega.
 * Orden: más reciente primero.
 */

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  highlights: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.012',
    date: '2026-04-29',
    highlights: [
      'Renombrado de tipos de envío y canal de pago para que sean nombres claros y genéricos para cualquier tienda (no jerga interna).',
      'Tipos de envío: "Bogo" → "Mensajería", "Bodega" → "Recogida en tienda", "Otros" → "Otro".',
      'Recaudo: el campo antes llamado "Bogo" ahora es "Pendiente del mensajero" (efectivo cobrado por el mensajero que aún no ha sido liquidado al negocio).',
      'Dashboard: la tarjeta "Bogo debe" ahora dice "Pendiente de liquidación" y el subtotal del recaudo dice "Pdte. liquidación".',
      'Asistente por voz: entiende los nombres nuevos ("el mensajero me liquidó", "lo cobró el courier", "contra entrega") y sigue aceptando los antiguos por compatibilidad.',
      'Excel: las columnas y hojas exportadas usan los nombres nuevos. Al importar acepta tanto el nombre nuevo "PENDIENTE MENSAJERO" como el legacy "EFECTIVO BOGO".',
      'Migración SQL automática (DO $$ ... $$ block) — la app sigue funcionando incluso si la columna no fue renombrada todavía, gracias a un fallback en cliente que detecta cuál nombre tiene la BD.',
      'Tests: 11 nuevos unit tests para los helpers deliveryTypeLabel, normalizeDeliveryType y getCourierPending.',
    ],
  },
  {
    version: '1.011',
    date: '2026-04-22',
    highlights: [
      'Pruebas automatizadas: 52 unit tests con Vitest cubriendo las funciones puras de la app (formato de moneda, parseo de montos, generación de códigos de pedido, normalización de vendedor, intenciones del librito, matching de fechas naturales).',
      'Suite E2E con Playwright: 8 pruebas en navegador real. 4 smoke tests sin auth (arranque, login, redirect protegido, password inválido) y 4 autenticadas (navegación entre pantallas, modales de ayuda, toggle Calendario/Lista persistente, librito del asistente).',
      'Fix: bug real detectado por las pruebas — cuando se guardaban dos "días" del librito en el mismo milisegundo, colisionaba el ID y al borrar uno se borraban los dos. Ahora el id incluye un sufijo aleatorio.',
      'Nuevos scripts: npm test, npm run test:watch, npm run test:e2e, npm run test:e2e:install.',
      'Documentación en README sobre cómo correr cada suite y qué variables de entorno esperan las pruebas autenticadas.',
    ],
  },
  {
    version: '1.010',
    date: '2026-04-17',
    highlights: [
      'Pedidos: el tipo de pago ahora se diferencia explícitamente — Contra entrega, Pago anticipado (ya pagó), Mixto (abono + saldo) y Otro (fiado, canje, especie).',
      'Guía de despacho: cuando el pedido es pago anticipado muestra un sello grande "YA PAGADO" para que el despachador no cobre nada. En Mixto muestra el abono y el saldo a cobrar.',
      'Nuevo Pedido: selector de tipo de pago con lógica automática (Anticipado marca el total como pagado, Mixto pide el abono, Contra entrega mantiene los 3 canales de recaudo).',
      'Lista de pedidos: nuevo filtro "Tipo de pago" junto a los demás filtros en modo Lista.',
      'Asistente por voz: entiende "ya pagó por Nequi", "abonó 30 mil y el resto al entregar", "fiado hasta el lunes" y guarda el tipo de pago correcto con el canal del abono.',
      'Contabilidad: cuando se vende un producto que no está en inventario, se crea automáticamente un registro en inventario con cantidad 0 y el costo de referencia del catálogo — así la contabilidad conserva el costo histórico del producto vendido.',
      'Inventario: ya no puede quedar en negativo. Si intenta descontar más de lo que hay, queda en 0.',
      'Requiere migración SQL (nueva columna payment_timing). El código es compatible con bases sin migrar — sigue funcionando, sólo que no guarda el tipo de pago hasta que corras el ALTER TABLE.',
    ],
  },
  {
    version: '1.009',
    date: '2026-04-17',
    highlights: [
      'Pedidos: nuevo toggle Calendario / Lista. La Lista tiene filtros por código, cliente, teléfono, dirección, ciudad, vendedor, tipo de envío, estado, producto, talla y color.',
      'KPIs del encabezado (Total, Entregados, Devoluciones, Cancelados, Recaudo, Utilidad) se recalculan en vivo según los filtros activos.',
      'Nuevo Pedido: campos separados para Barrio, Localidad y Sector/Conjunto. Si la ciudad queda vacía, se guarda automáticamente como "Bogotá".',
      'Nuevo Pedido: el detalle del producto ahora se captura estructurado (Cantidad, Talla, Color, Modelo) + observación libre. Esos campos quedan guardados con formato consistente para poder filtrar la lista por talla o color.',
      'Fix: cuando Paola creaba pedidos desde el Asistente, se guardaban con vendedor en minúscula y no se contaban en la tarjeta de Vendedora. Ahora el nombre de la vendedora se normaliza y las comparaciones son insensibles a mayúsculas.',
    ],
  },
  {
    version: '1.008',
    date: '2026-04-17',
    highlights: [
      'Zona peligrosa: el botón del modal ahora dice "Eliminar datos" (la cuenta queda como nueva, no se borra).',
      'Indicador en vivo para el tema "Sistema": muestra si está resolviendo a Claro u Oscuro.',
      'Densidad Compacta ya se nota — reduce paddings y espaciados en toda la app.',
      'Sonidos reales (WebAudio) al guardar preferencias y al borrar datos. Respetan el toggle.',
      'Vista previa de la guía de impresión ya no sobresale del recuadro.',
      'Móvil: header de Productos ordena mejor los botones en pantallas angostas.',
    ],
  },
  {
    version: '1.007',
    date: '2026-04-17',
    highlights: [
      'Botón "Nuevo Pedido" en la lista de Pedidos ya no se sale del viewport en móvil.',
      'Tamaño de letra de impresión totalmente ajustable: preset Personalizado con 4 steppers independientes (cabecera, cuerpo, destacado, pie) entre 6 y 24 pt.',
      'Vista previa de guía en /settings que refleja los tamaños en puntos reales.',
      'La impresión por lotes de /despacho respeta tu configuración.',
    ],
  },
  {
    version: '1.006',
    date: '2026-04-17',
    highlights: [
      'Nueva pantalla de Configuración completa: Apariencia (tema claro/oscuro/sistema, tamaño de letra UI, densidad, reducir animaciones), Preferencias generales (moneda, sonidos, confirmación), Preferencias de impresión y Zona peligrosa.',
      'Borrar todos los datos de la cuenta: requiere escribir "Acepto" para confirmar (también validado en el servidor).',
      'Botón de Ayuda por pantalla (Dashboard, Pedidos, Inventario, Productos, Despacho, Configuración).',
      'Asistente: librito de días guardados para guardar/restaurar chats completos.',
      'Menú inferior móvil: se agregó la entrada de Configuración.',
    ],
  },
  {
    version: '1.005',
    date: '2026-04-15',
    highlights: [
      'Fotos en inventario se amplían al tocarlas.',
      'Fix de desfase de fecha al importar desde Excel.',
    ],
  },
  {
    version: '1.004',
    date: '2026-04-14',
    highlights: [
      'Asistente: 20 ejemplos en la pantalla de bienvenida para empezar a usar rápido.',
    ],
  },
  {
    version: '1.003',
    date: '2026-04-13',
    highlights: [
      'Botón de ayuda dentro del Asistente.',
      'Fix del Dashboard en móvil.',
    ],
  },
  {
    version: '1.002',
    date: '2026-04-12',
    highlights: [
      'Costo de productos visible y editable.',
      'Asistente más honesto: confirma antes de ejecutar acciones.',
    ],
  },
  {
    version: '1.001',
    date: '2026-04-10',
    highlights: [
      'Primera versión pública de Tu Tienda Meraki.',
    ],
  },
];
