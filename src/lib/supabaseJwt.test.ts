import { describe, it, expect } from 'vitest';
import { jwtVerify } from 'jose';
import { mintSupabaseToken, supabaseJwtSecret } from './supabaseJwt';

const SECRET = 'test-secret-至少-bastante-largo-para-hs256-000000';

describe('mintSupabaseToken', () => {
  it('firma un JWT con role=authenticated y el claim tenant_id', async () => {
    const token = await mintSupabaseToken({ userId: 5, tenantId: 2, email: 'a@b.c' }, SECRET);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    expect(payload.role).toBe('authenticated');
    expect(payload.tenant_id).toBe(2);
    expect(payload.sub).toBe('5');
    expect(payload.aud).toBe('authenticated');
    expect(payload.email).toBe('a@b.c');
  });

  it('un secret distinto no valida el token (aislamiento de firma)', async () => {
    const token = await mintSupabaseToken({ userId: 1, tenantId: 1 }, SECRET);
    await expect(
      jwtVerify(token, new TextEncoder().encode('otro-secret-distinto-pero-largo-000')),
    ).rejects.toBeTruthy();
  });

  it('usa "app" como sub cuando no hay userId', async () => {
    const token = await mintSupabaseToken({ userId: null, tenantId: 3 }, SECRET);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    expect(payload.sub).toBe('app');
    expect(payload.tenant_id).toBe(3);
  });

  it('supabaseJwtSecret devuelve null si la env no está', () => {
    const prev = process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_JWT_SECRET;
    expect(supabaseJwtSecret()).toBeNull();
    if (prev !== undefined) process.env.SUPABASE_JWT_SECRET = prev;
  });
});
