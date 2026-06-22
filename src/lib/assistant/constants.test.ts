import { describe, it, expect } from 'vitest';
import { isDestructiveAction, MODIFYING_ACTIONS, DESTRUCTIVE_ACTIONS } from './constants';

describe('isDestructiveAction', () => {
  it('marca solo las acciones destructivas (irreversibles)', () => {
    expect(isDestructiveAction('delete_product')).toBe(true);
    expect(isDestructiveAction('create_product')).toBe(false);
    expect(isDestructiveAction('edit_order')).toBe(false);
    expect(isDestructiveAction('chat')).toBe(false);
    expect(isDestructiveAction(undefined)).toBe(false);
  });

  it('toda acción destructiva también es modificadora (pide confirmación)', () => {
    for (const a of DESTRUCTIVE_ACTIONS) {
      expect((MODIFYING_ACTIONS as readonly string[]).includes(a)).toBe(true);
    }
  });
});
