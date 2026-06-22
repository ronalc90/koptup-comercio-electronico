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
    version: '1.044',
    date: '2026-06-22',
    highlights: [
      'Al agregar VARIOS productos al inventario, ahora le pones foto a CADA UNO por separado (o saltas el que no quieras): el paso de foto muestra una tarjeta por producto con su nombre, color y talla.',
      'Antes pedía una sola foto y se la ponía a todos los productos. Ahora cada item guarda su propia foto (o ninguna).',
    ],
  },
  {
    version: '1.043',
    date: '2026-06-22',
    highlights: [
      'Arreglada la captura de inventario con varios colores/tallas: cada combinación queda con su cantidad EXACTA. Si no dices cuántas de cada una, el asistente pregunta en vez de repartir al azar.',
      'Captura en varios mensajes: el asistente ahora recuerda la canasta y el costo cuando te pregunta la talla/color en el siguiente mensaje (antes a veces se perdían).',
      'El costo que dices al agregar inventario ahora SÍ se guarda con el producto (antes se pedía y se descartaba).',
      'Productos sin talla o de "talla única" quedan como "Única" (igual que el filtro de inventario). Ya no convierte tallas a rangos ni insiste con la talla en productos que no la manejan.',
      'Cantidades en palabras: "una docena" = 12, "un par" = 2, "media docena" = 6. Si dices algo vago ("varios", "unas pocas"), te pregunta cuántas exactamente.',
      'Color, talla, observaciones y foto son opcionales; solo canasta y costo son obligatorios.',
    ],
  },
  {
    version: '1.042',
    date: '2026-06-20',
    highlights: [
      'El asistente ya puede ELIMINAR un producto del catálogo por chat ("borra el producto C001").',
      'Con doble seguro porque es irreversible: te avisa cuántos items de inventario quedarían sin producto y exige que escribas literalmente "Acepto" para borrar (no basta "sí" ni tocar un botón).',
      'Si hay varios productos parecidos, te pide el código exacto y no borra nada.',
    ],
  },
  {
    version: '1.041',
    date: '2026-06-20',
    highlights: [
      'El asistente ahora hace MUCHO más por chat o voz, no solo pedidos e inventario.',
      'Catálogo: crear productos nuevos y editarlos (nombre, categoría, costo, activar/desactivar). Antes solo se podía cambiar el costo.',
      'Inventario: corregir la cantidad exacta de un producto ("corrige el stock de X a 8") y moverlo de canasta ("pasa las X de la C03 a la C10").',
      'Gastos: ver el desglose por categoría ("¿en qué gasté este mes?"), buscar por rango de fechas y corregir un gasto ya registrado.',
      'Alertas: pedirle la lista de alertas abiertas y marcarlas como resueltas desde el chat.',
      'Volver a mostrar/imprimir la guía de despacho de cualquier pedido ("dame la guía del pedido #4061801"), no solo al crearlo.',
      'Todo con confirmación antes de guardar y, si hay varios productos/pedidos/gastos parecidos, te pregunta cuál para no equivocarse.',
    ],
  },
  {
    version: '1.040',
    date: '2026-06-20',
    highlights: [
      'El rol "Admin" ahora es puramente administrativo: gestiona el equipo (crear/editar usuarios y roles), la cuenta/configuración y la licencia. Ya NO entra a Dashboard, Pedidos, Asistente, Inventario, Productos, Despacho ni Agentes.',
      'Quienes operan la tienda usan el rol "Equipo". Las cuentas que venían trabajando como Admin se pasaron a "Equipo" para que sigan operando igual, sin perder nada.',
      'Al iniciar sesión, un Admin entra directo a "Administración"; su menú muestra solo Equipo, Licencia y Configuración (en celular y computador).',
      'El Superadministrador conserva acceso a todo (negocio + administración + plataforma).',
    ],
  },
  {
    version: '1.039',
    date: '2026-06-20',
    highlights: [
      'Chat más cómodo en el celular: los botones de Confirmar y Corregir son más grandes y fáciles de tocar con el pulgar, con un recordatorio de que también puedes confirmar diciendo "sí" o "no" por voz.',
      'La bienvenida del asistente es más clara: muestra un ejemplo de cada cosa que puede hacer (sin una lista interminable) en tarjetas más legibles, y mantiene "Ver todo lo que puedo hacer".',
      'Tu marca presente: el asistente muestra el logo de tu negocio en el encabezado y en la pantalla de inicio.',
      'Escribir es más cómodo: la caja de texto y el micrófono son más grandes, el teclado del celular ya no hace zoom al escribir y la tecla Enter dice "Enviar".',
    ],
  },
  {
    version: '1.038',
    date: '2026-06-18',
    highlights: [
      'CLAVE: el asistente ya vuelve a "ver" lo que acabas de registrar. Antes podías crear un pedido y, al preguntar "¿cuántos pedidos hoy?", te decía que no había ninguno; también afectaba el resumen del mes, buscar productos/inventario/gastos y editar pedidos. Corregido.',
      'Ahora puedes CONFIRMAR hablando: decir "sí, dale" o "confírmalo" (o "no, cancela") ejecuta o descarta la acción pendiente, sin tener que tocar el botón.',
      'Editar un pedido por el chat ahora pide confirmación ANTES de guardar (antes se aplicaba solo) y, si hay varios pedidos parecidos, te pregunta cuál para no cambiar el equivocado.',
      'Inventario más exacto: el stock se descuenta una sola vez (antes se descontaba doble al marcar "entregado"); marcar defectuoso, devolver o cambiar estado ya no tocan el producto/pedido equivocado cuando hay nombres parecidos.',
      'Las devoluciones restauran la cantidad real del pedido (no siempre 1) y no se duplican si repites la acción.',
      '"Pedidos pendientes" ahora muestra los de cualquier día (antes solo los de hoy). Las búsquedas avisan cuando hay más resultados de los que caben.',
      'El asistente valida antes de guardar: estado de pedido válido, categoría real del negocio, monto/costo no negativo y la canasta del inventario es obligatoria.',
      'El chat se adapta a tu negocio: nombre del asistente y ejemplos usan tus categorías reales (no quedan textos de otra tienda).',
    ],
  },
  {
    version: '1.037',
    date: '2026-06-18',
    highlights: [
      'IMPORTANTE: ahora TODOS los usuarios del negocio (admin, equipo) ven los pedidos, productos e inventario del negocio. Antes un filtro interno por usuario dejaba algunas pantallas vacías para quien no fuera la dueña.',
      'Seguridad: si se desactiva un usuario o se le baja el rol, pierde el acceso de inmediato (antes el ingreso podía seguir vivo hasta 30 días).',
      'Ya puedes cambiar tu contraseña desde Configuración (antes el formulario no hacía nada).',
      'Las guías de despacho, la ruta sugerida y los Excel exportados usan el nombre, logo y teléfono de TU negocio; se activó el botón "Mostrar logo en guías".',
      'El vendedor ya no aparece fijo como "Paola": toma tu usuario y las personas reales del negocio.',
      'Pantallas más robustas: bloqueo de scroll de fondo en ventanas emergentes, cierre con Escape, estado de carga en Administración y mensajes de error más claros.',
    ],
  },
  {
    version: '1.036',
    date: '2026-06-18',
    highlights: [
      'Onboarding de negocios nuevos sin tocar código: cada negocio tiene sus propias categorías, marca (nombre, color, eslogan, teléfono) y rubro para la IA, guardados en la base de datos.',
      'Un negocio nuevo ya NO hereda las categorías ni el asistente de pantuflas de Meraki: arranca con un base genérico y el superadmin lo personaliza.',
      'El asistente de IA (chat, captura de pedidos, inventario y "Con Foto IA") ahora habla del rubro de TU negocio, no de pantuflas.',
      'Plataforma (superadmin): al crear un negocio puedes definir su personalización, y un botón "Config" permite editarla después; aplica sin volver a entrar.',
    ],
  },
  {
    version: '1.035',
    date: '2026-06-18',
    highlights: [
      'Se eliminó una advertencia técnica en la consola del navegador ("Multiple GoTrueClient instances") creando un solo cliente de Supabase e inyectando el token de seguridad por petición. Sin cambios visibles para ti.',
    ],
  },
  {
    version: '1.034',
    date: '2026-06-18',
    highlights: [
      'Pulido tras una revisión interna de la entrega anterior.',
      'Al editar un producto/ítem cuya categoría ya no está en la lista del negocio, ahora se conserva y se muestra esa categoría (antes podía cambiarse sola sin avisar).',
      'El nombre del negocio, el teléfono y las categorías en Configuración, Inventario y Dashboard ya salen del negocio real (no siempre "Tu Tienda Meraki").',
      'En el catálogo móvil, los productos sin foto muestran un ícono de marcador (mejor alineación).',
      'La utilidad del Dashboard se rotuló como "Utilidad esperada" para no confundirla con la utilidad ya recaudada.',
      'Pequeños ajustes de espacio en barras inferiores para que nunca tapen contenido en celular.',
    ],
  },
  {
    version: '1.033',
    date: '2026-06-18',
    highlights: [
      'Las categorías de producto ahora son las de tu negocio (según su rubro), no las de pantuflas. Aplica en Productos e Inventario.',
      'Las fotos de los productos ya se ven: miniatura en el catálogo (lista y celular) y en el formulario, donde además puedes subir o cambiar la foto. La opción "Con Foto IA" ahora también guarda la foto.',
      'Se corrigió un mensaje confuso del panel: ya no dice "Margen 0.0%" cuando aún no ha entrado recaudo; ahora indica que el margen se calcula cuando lleguen los pagos.',
      'Arreglo en móvil: en Administración (y otras pantallas largas) ya se puede bajar hasta el final; antes la barra inferior tapaba el último bloque.',
    ],
  },
  {
    version: '1.032',
    date: '2026-06-18',
    highlights: [
      'Refuerzo de seguridad tras una auditoría completa: se cerraron varios huecos sin cambiar nada de tu día a día.',
      'La base de datos ahora rechaza datos imposibles (costos o montos negativos, estados de pedido inválidos, códigos de producto repetidos en el mismo negocio).',
      'Al editar usuarios, si el usuario no es de tu negocio la app responde "no encontrado" en vez de aparentar que lo cambió.',
      'Inicio de sesión más seguro: el mensaje de error es el mismo aunque falle el usuario o la contraseña (no se filtra cuál existe).',
      'El análisis de fotos con IA solo acepta imágenes (jpg/png/webp) de hasta 5 MB.',
      'Los mensajes de error técnicos ya no se muestran al usuario (se registran en el servidor).',
      'Arreglo visual: la etiqueta "Activo/Inactivo" ya no se recorta en celulares angostos.',
    ],
  },
  {
    version: '1.031',
    date: '2026-06-18',
    highlights: [
      'CORRECCIÓN IMPORTANTE: se podía romper la creación de productos (daba "Error al guardar"). Era un efecto del refuerzo de seguridad; ya quedó arreglado y se puede crear/editar/borrar productos normal.',
      'El Superadministrador ahora también entra a "Administración" (antes lo bloqueaba como si no fuera admin).',
      'Inicio de sesión más claro: si te bloquea por muchos intentos o hay un error, ahora muestra un mensaje visible (antes a veces no decía nada).',
      'Se quitó una advertencia técnica en la consola del navegador (instancias duplicadas de Supabase).',
    ],
  },
  {
    version: '1.030',
    date: '2026-06-17',
    highlights: [
      'Textos sin género: el rol ya no dice "Administradora" (femenino). Ahora muestra etiquetas neutras (Admin, Superadmin, Equipo, Solo lectura) que sirven para cualquier persona.',
      'El perfil en Configuración muestra el nombre real del negocio (no siempre "Tu Tienda Meraki").',
    ],
  },
  {
    version: '1.029',
    date: '2026-06-17',
    highlights: [
      'Agentes IA automáticos: los 5 agentes pueden correr solos (una vez al día) por cada negocio y dejar ALERTAS guardadas — ya no hay que abrir la pantalla para que analicen.',
      'Las alertas sin resolver aparecen arriba en el Dashboard; se pueden marcar como resueltas con un toque.',
      'El superadmin puede correr los agentes al instante desde "Plataforma" con el botón "Correr agentes".',
    ],
  },
  {
    version: '1.028',
    date: '2026-06-17',
    highlights: [
      'Protección anti fuerza bruta en el inicio de sesión: tras varios intentos fallidos seguidos se bloquea temporalmente (usando la IP real, no falsificable).',
      'Cobro con un formulario claro (en vez de ventanitas del navegador): muestra el monto sugerido y hasta cuándo quedará la licencia antes de confirmar; accesible y apto para móvil.',
      'El cobro ahora exige un monto mayor a 0 (ya no se puede extender una licencia con un pago de $0).',
    ],
  },
  {
    version: '1.027',
    date: '2026-06-17',
    highlights: [
      'Accesibilidad móvil: los botones de solo icono (editar, eliminar, cerrar, voz, foto, cambiar de día/mes…) ahora tienen etiqueta para lectores de pantalla.',
      'Áreas táctiles más cómodas: los botones chicos se ampliaron al mínimo recomendado (44px) para tocar más fácil en el celular.',
      'Foco visible al navegar con teclado y mejor contraste de textos tenues en modo oscuro.',
    ],
  },
  {
    version: '1.026',
    date: '2026-06-17',
    highlights: [
      'Bitácora de auditoría: queda registrado quién y cuándo hizo operaciones sensibles — pagos registrados, cambios de plan, alta/edición de usuarios y creación/estado de negocios.',
      'Cada negocio ve su "Actividad reciente" en la pantalla de Administración.',
      'La bitácora está cerrada a la clave pública (solo el servidor la escribe/lee, acotada a cada negocio).',
    ],
  },
  {
    version: '1.025',
    date: '2026-06-17',
    highlights: [
      'Aislamiento entre negocios ahora FORZADO por la base de datos (RLS estricta activada): aunque alguien tenga la clave pública, no puede leer los datos de ningún negocio sin una sesión válida. Verificado en producción: con sesión se ven los datos propios; sin sesión, la base devuelve vacío.',
      'Secreto de sesión reforzado en producción (clave aleatoria fuerte).',
      'Con esto quedan cerrados los 3 riesgos de seguridad P0 que detectó el panel de revisión.',
    ],
  },
  {
    version: '1.024',
    date: '2026-06-17',
    highlights: [
      'Tope de productos a prueba de concurrencia: si dos altas ocurren al mismo tiempo justo en el límite del plan, ya no pueden pasarse del tope (se aplicó la migración 005 con bloqueo por negocio).',
      'Se fijó la versión de Node (>=20) para builds reproducibles.',
      'Nuevo runbook de seguridad con los pasos exactos para reforzar producción (secreto de sesión y aislamiento por base de datos).',
    ],
  },
  {
    version: '1.023',
    date: '2026-06-17',
    highlights: [
      'Endurecimiento de seguridad (panel de revisión multi-rol): secreto de sesión más fuerte — si en producción es débil o falta, se avisa fuerte en los logs (sin tumbar la app). Acción recomendada: definir AUTH_SECRET (≥32 caracteres) en Vercel.',
      'La cookie de sesión viaja siempre cifrada en producción (no depende de cabeceras del proxy).',
      'Contraseñas más seguras al crear usuarios/negocios: mínimo 8 caracteres y al menos un número (no afecta el inicio de sesión de cuentas existentes).',
      'Búsqueda del asistente IA saneada (cierra un patrón de inyección de filtros).',
      'Más pruebas automáticas de autenticación y seguridad. 145 tests en total.',
    ],
  },
  {
    version: '1.022',
    date: '2026-06-17',
    highlights: [
      'Productos: ahora ves cuántos productos llevas frente al tope de tu plan (ej. 48/50) directamente en el catálogo.',
      'Aviso anticipado: al acercarte al límite (80% o más) aparece una advertencia para que consideres subir de plan a tiempo.',
      'Al llegar al tope, los botones para crear producto se deshabilitan con un mensaje claro para subir de plan, en vez de fallar al guardar.',
    ],
  },
  {
    version: '1.021',
    date: '2026-06-17',
    highlights: [
      'Seguridad de facturación: el plan de un negocio SOLO lo cambia el superadmin. Antes un administrador podía subirse a Enterprise (productos ilimitados) sin pagar — ya no.',
      'Fechas de licencia correctas a fin de mes: pagar el 31 de enero ahora vence el 28/29 de febrero (no se desbordaba a marzo).',
      'Al bajar de plan se valida que el negocio no quede por encima del nuevo tope de productos (evita estados inconsistentes).',
    ],
  },
  {
    version: '1.020',
    date: '2026-06-17',
    highlights: [
      'Licencias y facturación: cada negocio paga por su plan. Los planes ahora van por CANTIDAD DE PRODUCTOS (Free 50, Pro 500, Enterprise ilimitado) con precio mensual.',
      'Pantalla "Mi licencia" para cada negocio: muestra su plan, uso de productos (con barra), estado de la licencia (activa/vence/días), total pagado e historial de pagos.',
      'Consola de plataforma (superadmin): estado de licencia por negocio, botón "Cobrar" para registrar un pago y extender la licencia, e ingresos totales.',
      'El tope de productos se respeta de verdad (a nivel de base de datos): al llegar al límite no se pueden agregar más hasta subir de plan; los productos existentes nunca se borran. Meraki queda en Enterprise (ilimitado).',
    ],
  },
  {
    version: '1.019',
    date: '2026-06-17',
    highlights: [
      'Consola de plataforma (superadmin): la pantalla "Plataforma" ahora muestra el uso de cada negocio (pedidos, productos, usuarios) y permite cambiar su plan (Free/Pro/Enterprise) desde un selector.',
      'Planes con efecto real: cada plan define un tope de usuarios que se respeta al crear nuevos (los pedidos/productos quedan como uso informativo para no frenar la operación diaria).',
      'Nota: el cobro automático (pasarela de pagos) no se incluye — el plan se asigna a mano desde la consola.',
    ],
  },
  {
    version: '1.018',
    date: '2026-06-17',
    highlights: [
      'Agente Comercial mucho más certero con datos reales: casa los productos con las ventas por palabras distintivas del nombre (ej. "vaca", "pompom"), no por el código exacto (que los pedidos no traen). Antes marcaba los 198 productos como "muertos"; ahora detecta los que realmente no han vendido.',
      'Las alertas de "producto muerto" se agrupan en una sola alerta accionable en vez de inundar el panel con cientos.',
    ],
  },
  {
    version: '1.017',
    date: '2026-06-17',
    highlights: [
      'Agente Auditor más preciso: la detección de pedidos duplicados ahora exige teléfono y valor real, así deja de marcar cientos de falsos positivos en pedidos con nombre genérico (ej. "CLIENTE"). Las alertas pasan a ser accionables.',
    ],
  },
  {
    version: '1.016',
    date: '2026-06-17',
    highlights: [
      'Multi-tenant activado en la base de datos: se aplicó la migración 002 (tenants, usuarios y tenant_id en todas las tablas). Tus 106 pedidos y 198 productos quedaron asignados al negocio "Meraki" sin perder nada.',
      'Corrección en el sembrado de negocios: el segundo negocio ya no choca de id con el primero (se sincroniza la secuencia antes de insertarlo).',
      'Nuevo comando para aplicar SQL/migraciones desde la línea de comandos vía la Management API de Supabase (npm run db:exec).',
    ],
  },
  {
    version: '1.015',
    date: '2026-06-17',
    highlights: [
      'Onboarding de negocios (Fase 5): nuevo rol "superadmin" (Ronald) con la pantalla "Plataforma" para crear negocios nuevos y su primer administrador, listarlos y activar/desactivarlos — sin tocar la base de datos.',
      'Cada negocio creado al vuelo muestra SU propia marca (nombre y logo reales desde la base), no la de Meraki.',
      'El nombre y logo del negocio ahora viajan en la sesión, así un administrador que cambie el nombre lo ve reflejado tras volver a entrar.',
      'Jerarquía de roles: superadmin ⊃ admin ⊃ equipo ⊃ solo lectura. La gestión de "todos los negocios" queda restringida al superadmin.',
    ],
  },
  {
    version: '1.014',
    date: '2026-06-17',
    highlights: [
      'Aislamiento forzado por la base de datos (opt-in): la app puede firmar un token por usuario con su tenant para que las políticas RLS (migración 003) bloqueen el cruce de datos entre negocios incluso saltándose la app. Se activa al configurar SUPABASE_JWT_SECRET; si no, todo sigue igual.',
      'Automatizaciones (Fase 3): nuevo motor que convierte los hallazgos de los agentes en alertas accionables (reposición automática, stock, ventas, devoluciones, garantías/defectuosos, finanzas) con acción sugerida. Visibles en la pantalla "Agentes IA".',
      'Marketplace de módulos (Fase 4): la navegación se arma desde un registro de módulos por tenant. Cada negocio habilita sus módulos y les pone su propio nombre (PrimeraMayo muestra "Catálogo" y "Ventas").',
      'Administración (Fase 5): pantalla y API para administradores — crear usuarios del propio negocio, cambiar rol (admin/equipo/solo lectura), activar/desactivar y ver el plan. Todo acotado al propio negocio.',
      'Seguridad: todas las rutas de datos exigen sesión válida (sin caer a un tenant por defecto); rutas de IA, exportar/importar, subir imagen y migrar quedan autenticadas; subida de imágenes con tipo y tamaño validados; rol mínimo por defecto.',
      'Pruebas: nuevos unit tests (firma de token, motor de automatizaciones, registro de módulos). 99 en total.',
    ],
  },
  {
    version: '1.013',
    date: '2026-06-16',
    highlights: [
      'Plataforma multi-tenant (Fase 1): la misma instalación puede atender varios negocios. Se crean los tenants "Meraki" (pantuflas, maxisacos, bolsos, pocillos) y "PrimeraMayo" (cascos, repuestos y accesorios de moto).',
      'Aislamiento de datos: cada usuario solo ve los datos de su negocio. Un guard automático acota TODAS las consultas por tenant (en cliente y servidor), sin tocar las pantallas existentes.',
      'Retrocompatibilidad total: la app sigue funcionando igual antes y después de aplicar la migración SQL; el guard solo se activa cuando la base ya tiene la columna tenant_id.',
      'Usuarios y roles: tabla de usuarios real con contraseña cifrada (bcrypt) y roles (admin / equipo / solo lectura). Los usuarios actuales (paola, ronald, lizeth) siguen entrando igual.',
      'Marca por negocio: logo, nombre y colores propios por tenant (visibles en la barra lateral y el tema).',
      'Agentes IA (Fase 2): Auditor, QA, Inventario, Financiero y Comercial — analizan automáticamente cada negocio y muestran hallazgos en la nueva pantalla "Agentes IA".',
      'Gate de validación pre-despliegue: lint + typecheck + tests + migraciones + seguridad + aislamiento (npm run validate). No se despliega si algo falla.',
      'Pruebas: +21 unit tests nuevos (guard de aislamiento, config de tenant, JWT con tenant, y los 5 agentes).',
    ],
  },
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
