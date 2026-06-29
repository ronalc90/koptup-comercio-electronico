import type { PageHelpContent } from '@/components/shared/PageHelpModal';

export const DASHBOARD_HELP: PageHelpContent = {
  title: 'Inicio (Dashboard)',
  subtitle: 'Tu resumen del mes',
  intro:
    'Esta pantalla te muestra un resumen del mes: cuánto vendiste, cuántos pedidos hiciste, tus productos más vendidos y cómo va el negocio.',
  sections: [
    {
      title: '¿Qué vas a ver?',
      items: [
        'Total de pedidos del mes y ventas en pesos.',
        'Ganancia estimada y porcentaje de margen.',
        'Pedidos pendientes de entrega, pagos y devoluciones.',
        'Gráficas por estado del pedido y productos top.',
      ],
    },
    {
      title: '¿Qué podés hacer?',
      items: [
        'Cambiar de mes con las flechas ‹ › del encabezado.',
        'Exportar toda la información del mes a Excel.',
        'Tocar un pedido reciente para ver su detalle.',
      ],
    },
  ],
  tip: 'Si ves algún número raro, revisá primero los pedidos del mes seleccionado — el dashboard refleja siempre el mes activo.',
};

export const ORDERS_HELP: PageHelpContent = {
  title: 'Pedidos',
  subtitle: 'Crea, busca y da seguimiento',
  intro:
    'Acá gestionás los pedidos del mes: los podés crear, editar, cambiar de estado y ver día a día.',
  sections: [
    {
      title: '¿Qué vas a ver?',
      items: [
        'Lista de pedidos del mes agrupados por día.',
        'Resumen de cuánto se vendió, cuánto se pagó y cuánto quedó pendiente.',
        'Estado de cada pedido: Confirmado, Enviado, Entregado, Pagado, Devolución o Cancelado.',
      ],
    },
    {
      title: '¿Qué podés hacer?',
      items: [
        'Pulsá “Nuevo Pedido” para crear uno a mano o dictado por voz.',
        'Tocá un día para ver el detalle y editar los pedidos de esa fecha.',
        'Cambiá de mes con las flechas ‹ › del encabezado.',
      ],
    },
  ],
  tip: 'También podés crear o cambiar el estado de un pedido hablando con el asistente: “Carlos 3113339988, {cat} talla 38, 85 mil” o “el pedido de María ya lo entregaron”.',
  accentFrom: '#2563eb',
  accentTo: '#60a5fa',
};

export const INVENTORY_HELP: PageHelpContent = {
  title: 'Inventario',
  subtitle: 'Controla tu stock',
  intro:
    'Esta pantalla es el inventario de tu tienda: acá vas a ver todo lo que tenés disponible, su canasta, cantidad, color y talla.',
  sections: [
    {
      title: '¿Qué vas a ver?',
      items: [
        'Total de ítems, unidades y el valor aproximado del inventario.',
        'Dos pestañas: “Verificado” (stock bueno) y “Defectuoso” (para revisar o dar de baja).',
        'Canasta o ubicación física de cada producto.',
      ],
    },
    {
      title: '¿Qué podés hacer?',
      items: [
        'Pulsá “Agregar” para registrar productos nuevos con foto.',
        'Tocá un ítem para editarlo, cambiar cantidad o marcarlo como defectuoso.',
        'Exportá el inventario a Excel para revisarlo por fuera.',
      ],
    },
  ],
  tip: 'Si te llegó mercancía, se lo podés decir al asistente: “llegaron 5 {cat} talla 38 en C03 a 15.000” y queda cargado automáticamente.',
  accentFrom: '#059669',
  accentTo: '#34d399',
};

export const PRODUCTS_HELP: PageHelpContent = {
  title: 'Productos (Catálogo)',
  subtitle: 'El listado de lo que vendes',
  intro:
    'Acá registras los productos que ofrecés, con su código, categoría, foto y costo. Este catálogo es distinto del inventario: aquí va el "modelo" y su costo base; el inventario es cuánto de cada uno hay en canasta.',
  sections: [
    {
      title: '¿Qué vas a ver?',
      items: [
        'Código del producto (se usa en el inventario y en los pedidos).',
        'Nombre, categoría y estado (activo / inactivo).',
        'Costo en pesos — lo que te costó a vos.',
      ],
    },
    {
      title: '¿Qué podés hacer?',
      items: [
        'Crear un producto nuevo a mano o con "Con Foto IA" (el asistente sugiere código y nombre desde una foto).',
        'Editar costo: acepta 45000, 45.000 o $45.000 — se normaliza al guardar.',
        'Al editar el costo también se actualiza la referencia en el inventario vinculado.',
        'Exportar el catálogo completo a Excel.',
      ],
    },
  ],
  tip: 'También podés decirle al asistente "Las {cat} me costaron $15.000" y actualiza el costo solo. Si hay más de un producto que coincide, te pregunta cuál es el exacto antes de guardar.',
  accentFrom: '#0891b2',
  accentTo: '#22d3ee',
};

export const SETTINGS_HELP: PageHelpContent = {
  title: 'Configuración',
  subtitle: 'Tus preferencias y datos de la cuenta',
  intro:
    'Acá podés cambiar tu contraseña, configurar la API de IA, importar datos desde Excel, ajustar preferencias de impresión y ver quién hizo la app.',
  sections: [
    {
      title: '¿Qué podés hacer?',
      items: [
        'Cambiar tu contraseña de ingreso.',
        'Configurar la clave de OpenAI para que el asistente responda.',
        'Importar pedidos, inventario o productos desde un Excel.',
        'Elegir el tamaño de letra para imprimir la guía (Pequeño / Mediano / Grande) — se guarda por tu cuenta.',
      ],
    },
    {
      title: 'Acerca de',
      items: [
        'Versión de la app (cada entrega sube 0.001).',
        'Contacto del creador: WhatsApp +57 302 479 4842 o koptup.com.',
      ],
    },
  ],
  tip: 'Si el asistente responde “API key no configurada”, entrá acá, pegá tu clave de OpenAI y guardá.',
  accentFrom: '#7c3aed',
  accentTo: '#a855f7',
};

export const DISPATCH_HELP: PageHelpContent = {
  title: 'Despacho',
  subtitle: 'Prepara el envío del día',
  intro:
    'Acá armás el despacho: elegís los pedidos que salen hoy, imprimís las guías y revisás la ruta antes de entregar.',
  sections: [
    {
      title: '¿Qué vas a ver?',
      items: [
        'Los pedidos en estado “Confirmado” para la fecha seleccionada.',
        'Total de dinero a recoger entre los pedidos seleccionados.',
        'Datos de contacto del cliente, dirección y detalle del producto.',
      ],
    },
    {
      title: '¿Qué podés hacer?',
      items: [
        'Seleccioná los pedidos que vas a despachar (uno por uno o todos).',
        'Pulsá “Guías” para imprimir las guías listas para pegar.',
        'Pulsá “Ruta” para ver el orden sugerido de entrega por zonas.',
        'Cambiá la fecha arriba a la derecha para ver otro día.',
      ],
    },
  ],
  tip: 'Antes de imprimir, verificá que los pedidos estén “Confirmados”. Si falta alguno, revisá en Pedidos por qué no aparece acá.',
  accentFrom: '#ea580c',
  accentTo: '#fb923c',
};
