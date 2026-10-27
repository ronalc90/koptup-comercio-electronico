// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { sanitizeUploadFolder } from '@/lib/imageUpload';

// `folder` llega del cliente y forma parte de la ruta en Storage
// (`t{tenantId}/{folder}/…`): no debe permitir salir del prefijo del tenant.

let uploadedPaths: string[] = [];

vi.mock('@/lib/tenantServer', () => ({
  getRequestScopedClient: () =>
    Promise.resolve({
      ctx: { tenantId: 7 },
      client: {
        storage: {
          from: () => ({
            upload: (path: string) => {
              uploadedPaths.push(path);
              return Promise.resolve({ error: null });
            },
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.invalid/${path}` } }),
          }),
        },
      },
    }),
}));

import { POST } from './route';

// PNG mínimo: basta con los magic bytes para pasar la validación de la ruta.
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64')}`;

function req(body: unknown): NextRequest {
  return new Request('http://localhost/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  uploadedPaths = [];
});

describe('sanitizeUploadFolder', () => {
  it.each([undefined, null, ''])('%s → carpeta por defecto', (v) => {
    expect(sanitizeUploadFolder(v)).toBe('products');
  });

  it.each(['products', 'logos', 'foto-2024', 'mi_carpeta'])('acepta %s', (v) => {
    expect(sanitizeUploadFolder(v)).toBe(v);
  });

  it.each([
    '..', '../t1', 'products/../../t1', 'a/b', '/abs', 'logos.', '.hidden',
    'Products', 'con espacio', 'ñandú', 'a\\b', '%2e%2e', 'x'.repeat(41),
  ])('rechaza %s', (v) => {
    expect(sanitizeUploadFolder(v)).toBeNull();
  });

  it.each([123, {}, ['products'], true])('rechaza un valor no-string (%s)', (v) => {
    expect(sanitizeUploadFolder(v)).toBeNull();
  });
});

describe('POST /api/upload-image: carpeta', () => {
  it('sin folder sube a t{tenant}/products/', async () => {
    const res = await POST(req({ image: PNG }));
    expect(res.status).toBe(200);
    expect(uploadedPaths).toHaveLength(1);
    expect(uploadedPaths[0]).toMatch(/^t7\/products\/\d+-[a-z0-9]+\.png$/);
  });

  it('folder válido se respeta', async () => {
    const res = await POST(req({ image: PNG, folder: 'logos' }));
    expect(res.status).toBe(200);
    expect(uploadedPaths[0]).toMatch(/^t7\/logos\//);
  });

  it.each(['../t1', '../../t1/products', 'products/../../t2'])(
    'folder con traversal (%s) → 400 y no sube nada',
    async (folder) => {
      const res = await POST(req({ image: PNG, folder }));
      expect(res.status).toBe(400);
      expect(uploadedPaths).toEqual([]);
    },
  );
});
