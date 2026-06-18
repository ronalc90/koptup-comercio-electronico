/**
 * Ejemplos de la pantalla vacía del chat, GENERADOS a partir de las categorías
 * del negocio (tenant). Antes estaban hardcodeados a pantuflas ("vaquitas",
 * "maxisaco", "pantuflas stitch"), así que una tienda de motos veía ejemplos sin
 * sentido. Ahora los productos de los ejemplos salen de cfg.categories.
 *
 * `group` es una clave estable que la UI mapea a icono+rótulo.
 */

export type ExampleGroup =
  | 'Crear pedido'
  | 'Agregar inventario'
  | 'Buscar'
  | 'Pedidos'
  | 'Cambiar estado'
  | 'Costo producto'
  | 'Gasto general'
  | 'Devolución'
  | 'Defectuoso'
  | 'Reporte';

export interface AssistantExample {
  group: ExampleGroup;
  text: string;
}

function lc(cat: string): string {
  return (cat || '').toLowerCase().trim();
}

/** Singular best-effort en español: quita la 's'/'es' final para frases en singular. */
function singular(cat: string): string {
  const w = lc(cat);
  if (w.endsWith('es') && w.length > 3) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 2) return w.slice(0, -1);
  return w;
}

/**
 * Construye los ejemplos a partir de las categorías del negocio. Si no hay
 * categorías usa términos neutros ("producto").
 */
export function buildAssistantExamples(categories: string[]): AssistantExample[] {
  const cats = (categories || []).filter((c) => c && c.trim());
  const a = cats[0] ? lc(cats[0]) : 'producto';
  const b = cats[1] ? lc(cats[1]) : a;
  const aSing = cats[0] ? singular(cats[0]) : 'producto';

  return [
    { group: 'Crear pedido', text: `Carlos 3203436512 Cr 15 #80-25, ${a} $60.000` },
    { group: 'Crear pedido', text: `Pedido para María, Cll 72 #14-33, ${b}, $85.000` },
    { group: 'Crear pedido', text: `Juan 3201234567 Chía, ${a}, 110 mil, ya pagó por Nequi` },
    { group: 'Agregar inventario', text: `Tengo 10 ${a} en C015 a $15.000 cada una` },
    { group: 'Agregar inventario', text: `Puse 3 ${b} en C08 a 45 mil` },
    { group: 'Buscar', text: `¿Dónde están los ${a} negros?` },
    { group: 'Buscar', text: `¿Cuántos ${a} me quedan?` },
    { group: 'Pedidos', text: `¿Cuántos pedidos hay hoy?` },
    { group: 'Pedidos', text: `Pedidos pendientes de entrega` },
    { group: 'Cambiar estado', text: `El pedido de Carlos ya lo entregaron` },
    { group: 'Cambiar estado', text: `Ya me pagaron el de María, 85 mil` },
    { group: 'Cambiar estado', text: `Cancela el pedido #4041302` },
    { group: 'Costo producto', text: `Los ${a} me costaron $15.000 cada uno` },
    { group: 'Gasto general', text: `Pagué 800 mil de arriendo` },
    { group: 'Gasto general', text: `Gasté 25.000 en bolsas de empaque` },
    { group: 'Devolución', text: `Me devolvieron el pedido de Carlos` },
    { group: 'Defectuoso', text: `Un ${aSing} llegó defectuoso` },
    { group: 'Reporte', text: `Dame el reporte de hoy` },
    { group: 'Reporte', text: `¿Cuánto he vendido este mes?` },
  ];
}
