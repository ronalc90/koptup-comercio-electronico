import { describe, it, expect } from 'vitest';
import { resolveSingleMatch } from './matching';

describe('resolveSingleMatch: política estricta de coincidencia', () => {
  it('lista vacía o nula → none', () => {
    expect(resolveSingleMatch([]).kind).toBe('none');
    expect(resolveSingleMatch(null).kind).toBe('none');
    expect(resolveSingleMatch(undefined).kind).toBe('none');
  });

  it('una sola coincidencia → one con el item', () => {
    const r = resolveSingleMatch([{ id: 7 }]);
    expect(r.kind).toBe('one');
    if (r.kind === 'one') expect(r.item).toEqual({ id: 7 });
  });

  it('varias coincidencias → ambiguous con todos los candidatos', () => {
    const r = resolveSingleMatch([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates).toHaveLength(3);
  });
});
