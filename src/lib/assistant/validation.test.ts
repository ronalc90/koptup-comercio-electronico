import { describe, it, expect } from 'vitest';
import {
  normalizeOrderStatus,
  isValidOrderStatus,
  normalizeExpenseCategory,
  resolveTenantCategory,
  isNonNegativeAmount,
  normalizeQuantity,
  normalizeStockQuantity,
  isValidDateString,
  resolveDateRange,
} from './validation';

describe('normalizeOrderStatus', () => {
  it('acepta estados válidos sin importar acentos/mayúsculas', () => {
    expect(normalizeOrderStatus('entregado')).toBe('Entregado');
    expect(normalizeOrderStatus('ENVIADO')).toBe('Enviado');
    expect(normalizeOrderStatus('Pagado')).toBe('Pagado');
    expect(normalizeOrderStatus('devolución')).toBe('Devolucion');
    expect(normalizeOrderStatus('cancelado')).toBe('Cancelado');
    expect(normalizeOrderStatus('confirmado')).toBe('Confirmado');
  });

  it('rechaza estados inválidos', () => {
    expect(normalizeOrderStatus('despachado')).toBeNull();
    expect(normalizeOrderStatus('')).toBeNull();
    expect(normalizeOrderStatus(123)).toBeNull();
    expect(normalizeOrderStatus(undefined)).toBeNull();
  });

  it('isValidOrderStatus refleja la normalización', () => {
    expect(isValidOrderStatus('Entregado')).toBe(true);
    expect(isValidOrderStatus('inventado')).toBe(false);
  });
});

describe('normalizeExpenseCategory', () => {
  it('mapea a una categoría permitida', () => {
    expect(normalizeExpenseCategory('Arriendo')).toBe('arriendo');
    expect(normalizeExpenseCategory('envio')).toBe('envío');
    expect(normalizeExpenseCategory('PUBLICIDAD')).toBe('publicidad');
  });
  it('cae a "otro" si no coincide', () => {
    expect(normalizeExpenseCategory('cripto')).toBe('otro');
    expect(normalizeExpenseCategory(null)).toBe('otro');
    expect(normalizeExpenseCategory(42)).toBe('otro');
  });
});

describe('resolveTenantCategory', () => {
  const cats = ['Cascos', 'Repuestos', 'Lubricantes'];
  it('devuelve la categoría exacta del negocio (ignora acentos/mayúsculas)', () => {
    expect(resolveTenantCategory('cascos', cats)).toBe('Cascos');
    expect(resolveTenantCategory('REPUESTOS', cats)).toBe('Repuestos');
  });
  it('cae a la primera categoría si el modelo inventó una inexistente', () => {
    expect(resolveTenantCategory('Pantuflas', cats)).toBe('Cascos');
    expect(resolveTenantCategory('', cats)).toBe('Cascos');
    expect(resolveTenantCategory(undefined, cats)).toBe('Cascos');
  });
  it('si no hay categorías del negocio, usa "Otro"', () => {
    expect(resolveTenantCategory('x', [])).toBe('Otro');
  });
});

describe('isNonNegativeAmount', () => {
  it('valida números >= 0', () => {
    expect(isNonNegativeAmount(0)).toBe(true);
    expect(isNonNegativeAmount(15000)).toBe(true);
    expect(isNonNegativeAmount(-1)).toBe(false);
    expect(isNonNegativeAmount(NaN)).toBe(false);
    expect(isNonNegativeAmount('5')).toBe(false);
  });
});

describe('normalizeQuantity', () => {
  it('entero >= 1, default 1', () => {
    expect(normalizeQuantity(1)).toBe(1);
    expect(normalizeQuantity(3)).toBe(3);
    expect(normalizeQuantity('4')).toBe(4);
    expect(normalizeQuantity(2.7)).toBe(2);
    expect(normalizeQuantity(0)).toBe(1);
    expect(normalizeQuantity(-5)).toBe(1);
    expect(normalizeQuantity(undefined)).toBe(1);
    expect(normalizeQuantity('abc')).toBe(1);
  });
});

describe('normalizeStockQuantity', () => {
  it('entero >= 0 (permite 0), null si inválido', () => {
    expect(normalizeStockQuantity(0)).toBe(0);
    expect(normalizeStockQuantity(5)).toBe(5);
    expect(normalizeStockQuantity('8')).toBe(8);
    expect(normalizeStockQuantity(3.9)).toBe(3);
    expect(normalizeStockQuantity(-1)).toBeNull();
    expect(normalizeStockQuantity('x')).toBeNull();
    expect(normalizeStockQuantity(undefined)).toBeNull();
  });
});

describe('isValidDateString', () => {
  it('acepta fechas reales YYYY-MM-DD y rechaza el resto', () => {
    expect(isValidDateString('2026-06-20')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false); // no existe
    expect(isValidDateString('2026-6-1')).toBe(false);
    expect(isValidDateString('20-06-2026')).toBe(false);
    expect(isValidDateString('')).toBe(false);
    expect(isValidDateString(20260620)).toBe(false);
  });
});

describe('resolveDateRange', () => {
  const today = '2026-06-20';
  it('null si no hay fechas válidas', () => {
    expect(resolveDateRange(null, null, today)).toBeNull();
    expect(resolveDateRange('basura', undefined, today)).toBeNull();
  });
  it('usa today como extremo faltante', () => {
    expect(resolveDateRange('2026-06-01', null, today)).toEqual({ from: '2026-06-01', to: today });
    expect(resolveDateRange(null, '2026-06-15', today)).toEqual({ from: '2026-06-15', to: today });
  });
  it('intercambia si from > to', () => {
    expect(resolveDateRange('2026-06-30', '2026-06-01', today)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });
});
