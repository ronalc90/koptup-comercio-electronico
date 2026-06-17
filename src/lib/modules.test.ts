import { describe, it, expect } from 'vitest';
import { tenantNav, isModuleEnabled, MODULE_ORDER } from './modules';
import { getTenantConfig } from './tenants.config';

describe('módulos', () => {
  it('los core están siempre habilitados', () => {
    expect(isModuleEnabled([], 'dashboard')).toBe(true);
    expect(isModuleEnabled([], 'config')).toBe(true);
    expect(isModuleEnabled([], 'agentes')).toBe(false);
  });

  it('sin lista declarada (undefined) habilita todo — retrocompat meraki', () => {
    const nav = tenantNav(undefined);
    expect(nav.map((m) => m.key)).toEqual(MODULE_ORDER);
  });

  it('meraki muestra TODOS los módulos con labels por defecto', () => {
    const m = getTenantConfig('meraki');
    const nav = tenantNav(m.navModules, m.moduleLabels);
    expect(nav.map((x) => x.key)).toEqual(MODULE_ORDER);
    expect(nav.find((x) => x.key === 'productos')?.label).toBe('Productos');
    expect(nav.find((x) => x.key === 'pedidos')?.label).toBe('Pedidos');
  });

  it('primeramayo renombra módulos (Catálogo/Ventas) sin perder pantallas', () => {
    const pm = getTenantConfig('primeramayo');
    const nav = tenantNav(pm.navModules, pm.moduleLabels);
    expect(nav.find((x) => x.key === 'productos')?.label).toBe('Catálogo');
    expect(nav.find((x) => x.key === 'pedidos')?.label).toBe('Ventas');
    // core siempre presentes
    expect(nav.some((x) => x.key === 'dashboard')).toBe(true);
    expect(nav.some((x) => x.key === 'config')).toBe(true);
  });
});
