import { describe, it, expect } from 'vitest';
import {
  canAccessModule,
  canAccessRoute,
  isBusinessRoute,
  homeRouteForRole,
  BUSINESS_MODULES,
} from './permissions';
import type { ModuleKey } from './modules';
import type { Role } from './tenant';

const ALL_MODULES: ModuleKey[] = [
  'dashboard', 'pedidos', 'asistente', 'inventario', 'productos', 'despachos', 'agentes', 'config',
];

describe('canAccessModule', () => {
  it('admin NO ve módulos de negocio, pero sí config', () => {
    for (const m of BUSINESS_MODULES) {
      expect(canAccessModule('admin', m), `admin no debe ver ${m}`).toBe(false);
    }
    expect(canAccessModule('admin', 'config')).toBe(true);
  });

  it('member, viewer y superadmin ven todos los módulos', () => {
    for (const role of ['member', 'viewer', 'superadmin'] as Role[]) {
      for (const m of ALL_MODULES) {
        expect(canAccessModule(role, m), `${role} debe ver ${m}`).toBe(true);
      }
    }
  });
});

describe('isBusinessRoute', () => {
  it('reconoce rutas de negocio (incluye subrutas)', () => {
    expect(isBusinessRoute('/dashboard')).toBe(true);
    expect(isBusinessRoute('/orders')).toBe(true);
    expect(isBusinessRoute('/orders/daily/2026-06-20')).toBe(true);
    expect(isBusinessRoute('/products')).toBe(true);
    expect(isBusinessRoute('/assistant')).toBe(true);
    expect(isBusinessRoute('/inventory')).toBe(true);
    expect(isBusinessRoute('/dispatch')).toBe(true);
    expect(isBusinessRoute('/agents')).toBe(true);
  });
  it('NO marca como negocio las rutas administrativas/cuenta', () => {
    expect(isBusinessRoute('/admin')).toBe(false);
    expect(isBusinessRoute('/settings')).toBe(false);
    expect(isBusinessRoute('/billing')).toBe(false);
    expect(isBusinessRoute('/superadmin')).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it('admin bloqueado en rutas de negocio, permitido en administrativas', () => {
    expect(canAccessRoute('admin', '/products')).toBe(false);
    expect(canAccessRoute('admin', '/inventory')).toBe(false);
    expect(canAccessRoute('admin', '/assistant')).toBe(false);
    expect(canAccessRoute('admin', '/admin')).toBe(true);
    expect(canAccessRoute('admin', '/settings')).toBe(true);
    expect(canAccessRoute('admin', '/billing')).toBe(true);
  });
  it('member y superadmin pueden entrar a rutas de negocio', () => {
    expect(canAccessRoute('member', '/products')).toBe(true);
    expect(canAccessRoute('viewer', '/inventory')).toBe(true);
    expect(canAccessRoute('superadmin', '/assistant')).toBe(true);
  });
});

describe('homeRouteForRole', () => {
  it('admin arranca en /admin; el resto en /dashboard', () => {
    expect(homeRouteForRole('admin')).toBe('/admin');
    expect(homeRouteForRole('member')).toBe('/dashboard');
    expect(homeRouteForRole('viewer')).toBe('/dashboard');
    expect(homeRouteForRole('superadmin')).toBe('/dashboard');
  });
});
