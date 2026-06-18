import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  parseCopAmount,
  whatsappUrl,
  generateOrderCode,
  getMonthDays,
  getDayOfWeek,
  vendorDisplayName,
  sameVendor,
  cn,
} from './utils';

describe('formatCurrency', () => {
  it('formatea enteros como COP sin decimales', () => {
    const out = formatCurrency(85000);
    // Intl añade un non-breaking space entre el símbolo y el número
    // ("$\u00A085.000") — normalizamos a espacio común para chequear.
    expect(out.replace(/\s+/g, ' ')).toBe('$ 85.000');
  });

  it('acepta cero', () => {
    expect(formatCurrency(0).replace(/\s+/g, ' ')).toBe('$ 0');
  });

  it('redondea sin decimales', () => {
    const out = formatCurrency(1234).replace(/\s+/g, ' ');
    expect(out).toBe('$ 1.234');
  });
});

describe('parseCopAmount', () => {
  it('acepta enteros directamente', () => {
    expect(parseCopAmount(45000)).toBe(45000);
  });

  it('acepta strings con puntos de miles', () => {
    expect(parseCopAmount('45.000')).toBe(45000);
  });

  it('acepta strings con símbolo y espacios', () => {
    expect(parseCopAmount('$ 45.000')).toBe(45000);
  });

  it('acepta strings con coma (formato EE.UU.)', () => {
    expect(parseCopAmount('45,000')).toBe(45000);
  });

  it('rechaza negativos', () => {
    expect(parseCopAmount('-1000')).toBeNull();
    expect(parseCopAmount(-500)).toBeNull();
  });

  it('rechaza null/undefined/vacío', () => {
    expect(parseCopAmount(null)).toBeNull();
    expect(parseCopAmount(undefined)).toBeNull();
    expect(parseCopAmount('')).toBeNull();
    expect(parseCopAmount('   ')).toBeNull();
  });

  it('rechaza strings sin dígitos', () => {
    expect(parseCopAmount('abc')).toBeNull();
    expect(parseCopAmount('$$')).toBeNull();
  });

  it('rechaza NaN/Infinity', () => {
    expect(parseCopAmount(NaN)).toBeNull();
    expect(parseCopAmount(Infinity)).toBeNull();
  });
});

describe('whatsappUrl', () => {
  it('agrega código país 57 cuando falta en un celular colombiano', () => {
    expect(whatsappUrl('3113339988')).toBe('https://wa.me/573113339988');
  });

  it('no duplica código país si ya viene', () => {
    expect(whatsappUrl('573113339988')).toBe('https://wa.me/573113339988');
  });

  it('limpia espacios, guiones, puntos y paréntesis', () => {
    expect(whatsappUrl('(311) 333-9988')).toBe('https://wa.me/573113339988');
    expect(whatsappUrl('311.333.9988')).toBe('https://wa.me/573113339988');
  });

  it('codifica el mensaje opcional en la URL', () => {
    const url = whatsappUrl('3113339988', 'Hola Paola!');
    expect(url).toBe('https://wa.me/573113339988?text=Hola%20Paola!');
  });
});

describe('generateOrderCode', () => {
  it('formatea fecha + secuencia como 4MMDDNN', () => {
    const d = new Date(2026, 3, 17); // 17 de abril
    expect(generateOrderCode(d, 1)).toBe('4041701');
  });

  it('rellena con ceros mes, día y secuencia', () => {
    const d = new Date(2026, 0, 5); // 5 de enero
    expect(generateOrderCode(d, 7)).toBe('4010507');
  });

  it('soporta secuencias de dos dígitos', () => {
    const d = new Date(2026, 11, 31); // 31 de diciembre
    expect(generateOrderCode(d, 42)).toBe('4123142');
  });
});

describe('vendorDisplayName', () => {
  it('capitaliza un nombre en minúsculas', () => {
    expect(vendorDisplayName('paola')).toBe('Paola');
  });

  it('normaliza nombres ya capitalizados', () => {
    expect(vendorDisplayName('PAOLA')).toBe('Paola');
    expect(vendorDisplayName('Paola')).toBe('Paola');
  });

  it('owner vacío/null devuelve el fallback (por defecto cadena vacía, no un nombre fijo)', () => {
    // Antes caía a "Paola" (supuesto de Meraki). Ahora es neutro por tenant.
    expect(vendorDisplayName('')).toBe('');
    expect(vendorDisplayName('   ')).toBe('');
    expect(vendorDisplayName(null)).toBe('');
    expect(vendorDisplayName(undefined)).toBe('');
    // Acepta un fallback explícito (ej. la etiqueta de un KPI).
    expect(vendorDisplayName('', 'Vendedor')).toBe('Vendedor');
  });

  it('corta espacios en blanco al inicio y fin', () => {
    expect(vendorDisplayName('  carlos  ')).toBe('Carlos');
  });
});

describe('sameVendor', () => {
  it('compara insensible a mayúsculas', () => {
    expect(sameVendor('Paola', 'paola')).toBe(true);
    expect(sameVendor('PAOLA', 'Paola')).toBe(true);
  });

  it('compara insensible a espacios sobrantes', () => {
    expect(sameVendor(' paola ', 'Paola')).toBe(true);
  });

  it('diferencia nombres distintos', () => {
    expect(sameVendor('Paola', 'Carlos')).toBe(false);
  });

  it('trata null/undefined/vacío como equivalentes', () => {
    expect(sameVendor(null, '')).toBe(true);
    expect(sameVendor(undefined, null)).toBe(true);
  });
});

describe('getMonthDays', () => {
  it('devuelve 30 días para abril 2026', () => {
    expect(getMonthDays(2026, 4)).toHaveLength(30);
  });

  it('devuelve 28 días para febrero 2026 (no bisiesto)', () => {
    expect(getMonthDays(2026, 2)).toHaveLength(28);
  });

  it('devuelve 29 días para febrero 2024 (bisiesto)', () => {
    expect(getMonthDays(2024, 2)).toHaveLength(29);
  });

  it('el primer día es siempre el 1 del mes pedido', () => {
    const days = getMonthDays(2026, 4);
    expect(days[0].getDate()).toBe(1);
    expect(days[0].getMonth()).toBe(3); // abril = índice 3
  });
});

describe('getDayOfWeek', () => {
  it('devuelve el nombre en español', () => {
    // 2026-04-17 es viernes
    expect(getDayOfWeek(new Date(2026, 3, 17))).toBe('Viernes');
  });

  it('cubre domingo a sábado', () => {
    // Usamos una semana conocida — 2026-04-12 es domingo
    const base = new Date(2026, 3, 12);
    const expected = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      expect(getDayOfWeek(d)).toBe(expected[i]);
    }
  });
});

describe('cn (class merge)', () => {
  it('combina clases básicas', () => {
    expect(cn('p-2', 'text-sm')).toBe('p-2 text-sm');
  });

  it('omite valores falsy', () => {
    expect(cn('p-2', false, null, undefined, '')).toBe('p-2');
  });

  it('deduplica conflictos de Tailwind via twMerge', () => {
    // twMerge detecta que p-4 pisa a p-2
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
