/**
 * Registry de transportadoras (Fase E). Resuelve el `CarrierAdapter` a usar a
 * partir de la config de envíos del tenant (`tenants.shipping_config`).
 *
 * - carrier 'interrapidisimo' + credenciales → adaptador REAL contra su API.
 * - sin carrier real configurado → SandboxCarrierAdapter (flujo verificable e2e).
 *
 * El cliente HTTP es inyectable: en producción usa `fetchHttpClient`; en tests se
 * inyecta uno fake para ejercitar el adaptador real sin red.
 */
import type { CarrierAdapter, HttpClient } from './types';
import { InterrapidisimoAdapter, type InterrapidisimoCredentials } from './interrapidisimo';
import { SandboxCarrierAdapter } from './sandbox';
import { decryptCredentials } from './crypto';

export * from './types';
export { InterrapidisimoAdapter, normalizeInterrapidisimoStatus } from './interrapidisimo';
export { SandboxCarrierAdapter } from './sandbox';

/** Slugs de carrier soportados (para selectores de UI). */
export const SUPPORTED_CARRIERS = ['interrapidisimo', 'sandbox'] as const;
export type CarrierSlug = (typeof SUPPORTED_CARRIERS)[number];

export interface TenantShippingConfig {
  carrier?: string | null;
  enabled?: boolean;
  /** Blob cifrado de credenciales (ver crypto.ts). */
  credentials?: string | null;
}

/** Cliente HTTP basado en fetch (producción). */
export const fetchHttpClient: HttpClient = {
  async request({ method, url, headers, body }) {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: unknown = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  },
};

/**
 * Construye el adaptador de transportadora para un tenant. Si hay un carrier real
 * con credenciales válidas, devuelve su adaptador; si no, el sandbox funcional.
 * `http` permite inyectar un cliente fake en tests.
 */
export function getCarrierAdapter(
  config: TenantShippingConfig | null | undefined,
  http: HttpClient = fetchHttpClient,
): CarrierAdapter {
  const carrier = config?.carrier?.toLowerCase();
  if (carrier === 'interrapidisimo' && config?.enabled && config.credentials) {
    try {
      const creds = decryptCredentials<InterrapidisimoCredentials>(config.credentials);
      if (creds?.baseUrl && creds?.token) {
        return new InterrapidisimoAdapter(http, creds);
      }
    } catch {
      // Credenciales ilegibles/clave ausente → cae al sandbox (no rompe el flujo).
    }
  }
  return new SandboxCarrierAdapter();
}
