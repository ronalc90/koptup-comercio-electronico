import { describe, it, expect } from 'vitest';
import { buildAssistantExamples } from './examples';

describe('buildAssistantExamples: ejemplos por negocio (no hardcode a pantuflas)', () => {
  it('usa las categorías del negocio en los ejemplos', () => {
    const ex = buildAssistantExamples(['Cascos', 'Repuestos']);
    const all = ex.map((e) => e.text).join(' | ').toLowerCase();
    expect(all).toContain('cascos');
    // NO debe filtrarse el vocabulario de Meraki en una tienda de motos.
    expect(all).not.toContain('vaquita');
    expect(all).not.toContain('maxisaco');
    expect(all).not.toContain('pantufla');
  });

  it('singulariza para la frase de defectuoso', () => {
    const ex = buildAssistantExamples(['Cascos']);
    const def = ex.find((e) => e.group === 'Defectuoso');
    expect(def?.text.toLowerCase()).toContain('casco');
  });

  it('sin categorías cae a términos neutros', () => {
    const ex = buildAssistantExamples([]);
    expect(ex.map((e) => e.text).join(' ').toLowerCase()).toContain('producto');
  });

  it('cubre todos los grupos de capacidades principales', () => {
    const groups = new Set(buildAssistantExamples(['Cascos']).map((e) => e.group));
    for (const g of ['Crear pedido', 'Agregar inventario', 'Buscar', 'Pedidos',
      'Cambiar estado', 'Costo producto', 'Gasto general', 'Devolución',
      'Defectuoso', 'Reporte'] as const) {
      expect(groups.has(g), g).toBe(true);
    }
  });
});
