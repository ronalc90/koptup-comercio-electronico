import { describe, it, expect } from 'vitest';
import {
  deliveryTypeLabel,
  normalizeDeliveryType,
  getCourierPending,
  type Order,
} from './types';

describe('deliveryTypeLabel', () => {
  it('mapea valores legacy a labels actuales', () => {
    expect(deliveryTypeLabel('Bogo')).toBe('Mensajería');
    expect(deliveryTypeLabel('Bodega')).toBe('Recogida en tienda');
    expect(deliveryTypeLabel('Otros')).toBe('Otro');
  });

  it('mapea valores canónicos v1.012 a labels', () => {
    expect(deliveryTypeLabel('Mensajeria')).toBe('Mensajería');
    expect(deliveryTypeLabel('Recogida')).toBe('Recogida en tienda');
    expect(deliveryTypeLabel('Otro')).toBe('Otro');
  });

  it('devuelve string vacío para vacío/null/undefined', () => {
    expect(deliveryTypeLabel('')).toBe('');
    expect(deliveryTypeLabel(null)).toBe('');
    expect(deliveryTypeLabel(undefined)).toBe('');
  });
});

describe('normalizeDeliveryType', () => {
  it('convierte legacy a canónico', () => {
    expect(normalizeDeliveryType('Bogo')).toBe('Mensajeria');
    expect(normalizeDeliveryType('Bodega')).toBe('Recogida');
    expect(normalizeDeliveryType('Otros')).toBe('Otro');
  });

  it('preserva valores canónicos', () => {
    expect(normalizeDeliveryType('Mensajeria')).toBe('Mensajeria');
    expect(normalizeDeliveryType('Recogida')).toBe('Recogida');
    expect(normalizeDeliveryType('Otro')).toBe('Otro');
  });

  it('preserva vacío y null/undefined → vacío', () => {
    expect(normalizeDeliveryType('')).toBe('');
    expect(normalizeDeliveryType(null)).toBe('');
    expect(normalizeDeliveryType(undefined)).toBe('');
  });
});

describe('getCourierPending', () => {
  function makeOrder(partial: Partial<Order>): Order {
    return {
      id: 1,
      order_code: '4040101',
      client_name: 'Test',
      phone: '',
      city: '',
      address: '',
      complement: '',
      product_ref: '',
      detail: '',
      comment: '',
      value_to_collect: 0,
      payment_cash: 0,
      payment_transfer: 0,
      product_cost: 0,
      delivery_type: 'Mensajeria',
      vendor: 'Paola',
      delivery_status: 'Confirmado',
      status_complement: '',
      is_exchange: false,
      order_date: '2026-04-22',
      dispatch_date: null,
      guide_number: '',
      prepaid_amount: 0,
      operating_cost: 0,
      created_at: '',
      ...partial,
    };
  }

  it('lee el campo nuevo cuando está disponible', () => {
    const o = makeOrder({ payment_courier_pending: 50000 });
    expect(getCourierPending(o)).toBe(50000);
  });

  it('cae al campo legacy cuando el nuevo no está', () => {
    const o = makeOrder({ payment_courier_pending: undefined, payment_cash_bogo: 30000 });
    expect(getCourierPending(o)).toBe(30000);
  });

  it('prefiere el nuevo sobre el legacy si ambos vienen', () => {
    const o = makeOrder({ payment_courier_pending: 100, payment_cash_bogo: 999 });
    expect(getCourierPending(o)).toBe(100);
  });

  it('devuelve 0 si ninguno está', () => {
    const o = makeOrder({ payment_courier_pending: undefined, payment_cash_bogo: undefined });
    expect(getCourierPending(o)).toBe(0);
  });

  it('tolera null y undefined del orden', () => {
    expect(getCourierPending(null)).toBe(0);
    expect(getCourierPending(undefined)).toBe(0);
  });
});
