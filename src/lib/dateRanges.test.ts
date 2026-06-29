import { describe, it, expect } from 'vitest';
import { periodRange } from './dateRanges';

describe('periodRange', () => {
  it('día = hoy..hoy', () => {
    expect(periodRange('dia', '2026-06-29')).toEqual({ from: '2026-06-29', to: '2026-06-29' });
  });
  it('mes = día 1..hoy', () => {
    expect(periodRange('mes', '2026-06-29')).toEqual({ from: '2026-06-01', to: '2026-06-29' });
  });
  it('semana = lunes..hoy (29-jun-2026 es lunes)', () => {
    // 2026-06-29 es lunes → from = mismo día.
    expect(periodRange('semana', '2026-06-29')).toEqual({ from: '2026-06-29', to: '2026-06-29' });
  });
  it('semana en domingo retrocede 6 días al lunes', () => {
    // 2026-07-05 es domingo → lunes = 2026-06-29.
    expect(periodRange('semana', '2026-07-05')).toEqual({ from: '2026-06-29', to: '2026-07-05' });
  });
  it('semana a mitad: miércoles 2026-07-01 → lunes 2026-06-29', () => {
    expect(periodRange('semana', '2026-07-01')).toEqual({ from: '2026-06-29', to: '2026-07-01' });
  });
});
