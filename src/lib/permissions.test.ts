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
  it('admin y superadmin NO ven módulos de negocio, pero sí config', () => {
    for (const role of ['admin', 'superadmin'] as Role[]) {
      for (const m of BUSINESS_MODULES) {
        expect(canAccessModule(role, m), `${role} no debe ver ${m}`).toBe(false);
      }
      expect(canAccessModule(role, 'config')).toBe(true);
    }
  });

  it('member y viewer ven todos los módulos', () => {
    for (const role of ['member', 'viewer'] as Role[]) {
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
  it('admin y superadmin bloqueados en rutas de negocio, permitidos en administrativas/plataforma', () => {
    for (const role of ['admin', 'superadmin'] as Role[]) {
      expect(canAccessRoute(role, '/products')).toBe(false);
      expect(canAccessRoute(role, '/inventory')).toBe(false);
      expect(canAccessRoute(role, '/assistant')).toBe(false);
      expect(canAccessRoute(role, '/admin')).toBe(true);
      expect(canAccessRoute(role, '/settings')).toBe(true);
      expect(canAccessRoute(role, '/billing')).toBe(true);
    }
    expect(canAccessRoute('superadmin', '/superadmin')).toBe(true);
  });
  it('member y viewer pueden entrar a rutas de negocio', () => {
    expect(canAccessRoute('member', '/products')).toBe(true);
    expect(canAccessRoute('viewer', '/inventory')).toBe(true);
  });
});

describe('homeRouteForRole', () => {
  it('superadmin → /superadmin; admin → /admin; el resto → /dashboard', () => {
    expect(homeRouteForRole('superadmin')).toBe('/superadmin');
    expect(homeRouteForRole('admin')).toBe('/admin');
    expect(homeRouteForRole('member')).toBe('/dashboard');
    expect(homeRouteForRole('viewer')).toBe('/dashboard');
  });
});
