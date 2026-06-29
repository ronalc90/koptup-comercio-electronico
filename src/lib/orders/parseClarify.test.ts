import { describe, it, expect } from 'vitest';
import {
  buildCatalogIndex,
  lookupModel,
  requiredFieldGaps,
  productGaps,
  decideClarification,
  composeDetail,
  type CatalogIndex,
  type ParsedProduct,
} from './parseClarify';

// Catálogo de prueba: "clasica" con tallas 38/40 en miel/negro (no toda combo),
// "bolso" color único sin talla, "pantufla" varios colores sin talla.
const products = [
  { code: 'CLA', name: 'Clasica' },
  { code: 'BOL', name: 'Bolso' },
  { code: 'PAN', name: 'Pantufla' },
];
const inventory = [
  { model: 'Clasica', color: 'miel', size: '38' },
  { model: 'Clasica', color: 'miel', size: '40' },
  { model: 'Clasica', color: 'negro', size: '38' }, // OJO: no hay "negro 40"
  { model: 'Bolso', color: 'café', size: 'Única' },
  { model: 'Pantufla', color: 'rojo', size: 'Única' },
  { model: 'Pantufla', color: 'azul', size: 'Única' },
];
const idx: CatalogIndex = buildCatalogIndex(products, inventory);

const fullOrder = {
  client_name: 'Carlos',
  phone: '3203436512',
  address: 'Calle 80 #1-2',
  value_to_collect: 60000,
};

describe('buildCatalogIndex / lookupModel', () => {
  it('agrupa colores y tallas por modelo, excluyendo "Única"', () => {
    const cla = lookupModel(idx, 'clasica')!;
    expect(cla.colors.sort()).toEqual(['miel', 'negro']);
    expect(cla.sizes.sort()).toEqual(['38', '40']);
    const bolso = lookupModel(idx, 'bolso')!;
    expect(bolso.sizes).toEqual([]); // "Única" no cuenta como talla
    expect(bolso.colors).toEqual(['café']);
  });

  it('guarda solo las combinaciones color+talla reales en stock', () => {
    const cla = lookupModel(idx, 'clasica')!;
    expect(cla.combos.has('miel|40')).toBe(true);
    expect(cla.combos.has('negro|40')).toBe(false); // no existe esa combinación
  });

  it('coincidencia difusa: encuentra el modelo por substring', () => {
    expect(lookupModel(idx, 'pantuflas')).not.toBeNull();
    expect(lookupModel(idx, 'inexistente')).toBeNull();
  });

  it('no confunde modelos que solo comparten la primera palabra', () => {
    const idx2 = buildCatalogIndex(
      [{ code: 'BD', name: 'Bota Dama' }, { code: 'BN', name: 'Bota Niño' }],
      [
        { model: 'Bota Dama', color: 'negro', size: '37' },
        { model: 'Bota Niño', color: 'café', size: '30' },
      ],
    );
    // "bota dama" NO debe resolver a "bota niño" (ni viceversa).
    expect(lookupModel(idx2, 'bota dama')!.colors).toEqual(['negro']);
    expect(lookupModel(idx2, 'bota niño')!.colors).toEqual(['café']);
  });
});

describe('requiredFieldGaps: datos de despacho obligatorios (escenario F)', () => {
  it('pedido completo no pide nada', () => {
    expect(requiredFieldGaps(fullOrder).missing).toEqual([]);
  });
  it('sin teléfono ni dirección → pregunta ambos', () => {
    const r = requiredFieldGaps({ client_name: 'Pedro', value_to_collect: 60000 });
    expect(r.missing).toContain('address');
    expect(r.missing).toContain('phone');
    expect(r.questions.join(' ')).toMatch(/dirección/i);
    expect(r.questions.join(' ')).toMatch(/teléfono/i);
  });
  it('valor 0 o ausente → pregunta el valor a cobrar', () => {
    expect(requiredFieldGaps({ ...fullOrder, value_to_collect: 0 }).missing).toContain('value_to_collect');
    expect(requiredFieldGaps({ ...fullOrder, value_to_collect: null }).missing).toContain('value_to_collect');
  });
});

describe('productGaps: variantes contra inventario', () => {
  it('escenario A — N unidades con M atributos (M<N): pregunta el color de la línea sin color', () => {
    // "3 pantuflas, 2 rojas y 1 ?" → 2 líneas, la 2a sin color.
    const items: ParsedProduct[] = [
      { model: 'pantufla', color: 'rojo', quantity: 2 },
      { model: 'pantufla', quantity: 1 },
    ];
    const r = productGaps(items, idx);
    expect(r.missing).toContain('color');
    // Referencia la línea concreta por ordinal (hay varias del mismo modelo).
    expect(r.questions.some((q) => /segundo pantufla/i.test(q))).toBe(true);
  });

  it('escenario B — "dos pantuflas rojas" (1 línea x2): color presente → no pregunta color', () => {
    const r = productGaps([{ model: 'pantufla', color: 'rojo', quantity: 2 }], idx);
    expect(r.missing).not.toContain('color');
    expect(r.status).toBe('complete');
  });

  it('escenario B — "dos pantuflas y un bolso": bolso color único no pregunta, pantufla sin color sí', () => {
    const r = productGaps(
      [{ model: 'pantufla', quantity: 2 }, { model: 'bolso', quantity: 1 }],
      idx,
    );
    // pantufla tiene 2 colores → pregunta; bolso 1 color → no.
    expect(r.missing).toContain('color');
    expect(r.questions.some((q) => /bolso/i.test(q))).toBe(false);
  });

  it('escenario C — mismo modelo, variantes distintas, ambas en stock → completo', () => {
    const r = productGaps(
      [
        { model: 'clasica', size: '38', color: 'miel', quantity: 2 },
        { model: 'clasica', size: '38', color: 'negro', quantity: 1 },
      ],
      idx,
    );
    expect(r.status).toBe('complete');
  });

  it('escenario C/E — combinación color+talla inexistente (negro 40) → pregunta y sugiere', () => {
    const r = productGaps([{ model: 'clasica', size: '40', color: 'negro', quantity: 1 }], idx);
    expect(r.missing).toContain('combo_unavailable');
    expect(r.questions[0]).toMatch(/no tengo clasica negro en talla 40/i);
  });

  it('escenario D — producto sin talla cuando el modelo usa tallas → pregunta talla', () => {
    const r = productGaps([{ model: 'clasica', color: 'miel', quantity: 1 }], idx);
    expect(r.missing).toContain('size');
    expect(r.questions.join(' ')).toMatch(/talla/i);
  });

  it('escenario E — color inexistente en el catálogo → ofrece los disponibles', () => {
    const r = productGaps([{ model: 'pantufla', color: 'turquesa', quantity: 1 }], idx);
    expect(r.missing).toContain('color_invalid');
    expect(r.questions[0]).toMatch(/rojo|azul/);
  });

  it('escenario E — talla inexistente (99) → ofrece tallas reales', () => {
    const r = productGaps([{ model: 'clasica', color: 'miel', size: '99', quantity: 1 }], idx);
    expect(r.missing).toContain('size_invalid');
    expect(r.questions[0]).toMatch(/38|40/);
  });

  it('producto no reconocido en el catálogo → pide confirmación, no inventa', () => {
    const r = productGaps([{ model: 'casco lunar', quantity: 1 }], idx);
    expect(r.missing).toContain('product_unknown');
  });
});

describe('decideClarification: decisión final (el servidor manda)', () => {
  it('pedido completo y variante válida → complete sin preguntas', () => {
    const r = decideClarification(
      {
        status: 'complete',
        order: fullOrder,
        products: [{ model: 'clasica', color: 'miel', size: '40', quantity: 1 }],
      },
      idx,
    );
    expect(r.status).toBe('complete');
    expect(r.questions).toEqual([]);
  });

  it('el LLM dice complete pero falta dirección → se degrada a needs_clarification', () => {
    const r = decideClarification(
      {
        status: 'complete',
        order: { client_name: 'Ana', phone: '3001112233', value_to_collect: 50000 },
        products: [{ model: 'pantufla', color: 'rojo', quantity: 1 }],
      },
      idx,
    );
    expect(r.status).toBe('needs_clarification');
    expect(r.missing).toContain('address');
  });

  it('not_order pasa tal cual', () => {
    const r = decideClarification({ status: 'not_order' }, idx);
    expect(r.status).toBe('not_order');
    expect(r.questions).toEqual([]);
  });

  it('sin productos → pide el producto', () => {
    const r = decideClarification({ status: 'complete', order: fullOrder, products: [] }, idx);
    expect(r.status).toBe('needs_clarification');
    expect(r.missing).toContain('product');
  });

  it('escenario G — ruido: campos extraídos válidos + combo en stock → complete (sin ruido en preguntas)', () => {
    const r = decideClarification(
      {
        status: 'complete',
        order: {
          client_name: 'Carlos Sanabria',
          phone: '3203436512',
          address: 'Calle 80A #116B-82',
          value_to_collect: 60000,
          comment: 'Tel alternativo: 6017654321',
        },
        products: [{ model: 'clasica', color: 'miel', size: '40', quantity: 1 }],
      },
      idx,
    );
    expect(r.status).toBe('complete');
  });

  it('dedupe: no repite la misma pregunta aunque la añada el LLM', () => {
    const r = decideClarification(
      {
        status: 'needs_clarification',
        order: { client_name: 'Ana', phone: '3001112233', address: 'x', value_to_collect: 5000 },
        products: [{ model: 'pantufla', quantity: 1 }],
        questions: ['¿De qué color es el pantufla? Disponibles: rojo, azul.'],
      },
      idx,
    );
    const colorQs = r.questions.filter((q) => /de qué color/i.test(q));
    expect(colorQs.length).toBe(1);
  });
});

describe('composeDetail: detail legible desde líneas de producto', () => {
  it('una línea con cantidad y atributos', () => {
    expect(composeDetail([{ model: 'Clasica', size: '40', color: 'miel', quantity: 2 }]))
      .toBe('2 x Clasica talla 40 miel');
  });
  it('varias líneas se unen con coma; cantidad 1 sin prefijo', () => {
    expect(composeDetail([
      { model: 'Pantufla', color: 'rojo', quantity: 2 },
      { model: 'Bolso', quantity: 1 },
    ])).toBe('2 x Pantufla rojo, Bolso');
  });
  it('ignora líneas sin modelo', () => {
    expect(composeDetail([{ model: '', quantity: 1 }, { model: 'Bolso', quantity: 1 }])).toBe('Bolso');
  });
});
