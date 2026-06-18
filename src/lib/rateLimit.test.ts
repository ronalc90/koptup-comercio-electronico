import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clearRateLimit, _resetRateLimitStore } from './rateLimit';

beforeEach(() => _resetRateLimitStore());

describe('rateLimit', () => {
  it('permite hasta `max` intentos y luego bloquea', () => {
    const t0 = 1000;
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('k', 3, 60_000, t0).allowed).toBe(true);
    }
    const blocked = rateLimit('k', 3, 60_000, t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('se reinicia al pasar la ventana', () => {
    const t0 = 1000;
    rateLimit('k', 1, 10_000, t0);
    expect(rateLimit('k', 1, 10_000, t0).allowed).toBe(false);
    // pasada la ventana
    expect(rateLimit('k', 1, 10_000, t0 + 10_001).allowed).toBe(true);
  });

  it('clearRateLimit resetea el contador (login exitoso)', () => {
    const t0 = 1000;
    rateLimit('k', 2, 60_000, t0);
    rateLimit('k', 2, 60_000, t0);
    expect(rateLimit('k', 2, 60_000, t0).allowed).toBe(false);
    clearRateLimit('k');
    expect(rateLimit('k', 2, 60_000, t0).allowed).toBe(true);
  });

  it('keys distintos no se afectan', () => {
    const t0 = 1000;
    rateLimit('a', 1, 60_000, t0);
    expect(rateLimit('a', 1, 60_000, t0).allowed).toBe(false);
    expect(rateLimit('b', 1, 60_000, t0).allowed).toBe(true);
  });
});
