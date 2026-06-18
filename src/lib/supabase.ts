import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isTenantTable } from './tenant';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isConfigured = supabaseUrl.startsWith('http') && supabaseAnonKey.length > 0;

// Create a mock client that returns empty results when Supabase is not configured
function createMockClient(): SupabaseClient {
  const mockResponse = { data: [], error: null, count: 0 };
  const mockSingle = { data: null, error: null };

  const chainable: Record<string, unknown> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq',
    'gte', 'lte', 'gt', 'lt', 'like', 'ilike', 'in', 'order', 'limit', 'range',
    'single', 'maybeSingle', 'filter', 'match', 'not', 'or', 'contains',
    'containedBy', 'textSearch'];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === 'then') return undefined;
      if (prop === 'single' || prop === 'maybeSingle') return () => Promise.resolve(mockSingle);
      if (methods.includes(prop)) return () => new Proxy(chainable, handler);
      return () => new Proxy(chainable, handler);
    },
  };

  const fromProxy = new Proxy(chainable, handler);

  return {
    from: () => fromProxy,
    rpc: () => Promise.resolve(mockResponse),
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  } as unknown as SupabaseClient;
}

// ============================================================================
// GUARD MULTI-TENANT
// ----------------------------------------------------------------------------
// Envuelve un cliente Supabase de modo que TODA consulta a una tabla de negocio
// quede automáticamente acotada al tenant indicado, sin tocar los call-sites:
//   * select / update / delete  → se añade `.eq('tenant_id', tid)`.
//   * insert / upsert           → se inyecta `tenant_id` en el payload.
// `tenantId == null` ⇒ passthrough total (estado pre-migración: el guard NO
// hace nada, así la app se comporta EXACTAMENTE igual que antes).
// ============================================================================

type AnyBuilder = Record<string | symbol, unknown>;

function injectTenant(values: unknown, tid: number): unknown {
  // tenant_id va AL FINAL: si el payload trae uno propio, el del guard gana
  // (un cliente no puede escribir en otro tenant inyectando su propio tenant_id).
  if (Array.isArray(values)) {
    return values.map((v) => (v && typeof v === 'object' ? { ...v, tenant_id: tid } : v));
  }
  if (values && typeof values === 'object') {
    return { ...(values as object), tenant_id: tid };
  }
  return values;
}

/** Quita tenant_id de un payload de UPDATE: nadie mueve filas entre tenants. */
function stripTenant(values: unknown): unknown {
  if (Array.isArray(values)) return values.map(stripTenant);
  if (values && typeof values === 'object') {
    const clone = { ...(values as Record<string, unknown>) };
    delete clone.tenant_id;
    return clone;
  }
  return values;
}

function guardBuilder(builder: AnyBuilder, table: string, tid: number): AnyBuilder {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);

      if (prop === 'insert' && typeof orig === 'function') {
        return (values: unknown, opts?: unknown) =>
          (orig as (v: unknown, o?: unknown) => unknown).call(target, injectTenant(values, tid), opts);
      }

      if (prop === 'upsert' && typeof orig === 'function') {
        return (values: unknown, opts?: Record<string, unknown>) => {
          let o = opts;
          // settings dejó de ser UNIQUE(key) global → ahora UNIQUE(tenant_id, key).
          if (table === 'settings' && o && o.onConflict === 'key') {
            o = { ...o, onConflict: 'tenant_id,key' };
          }
          return (orig as (v: unknown, o?: unknown) => unknown).call(target, injectTenant(values, tid), o);
        };
      }

      if (prop === 'update' && typeof orig === 'function') {
        return (values: unknown, opts?: unknown) => {
          const result = (orig as (v: unknown, o?: unknown) => AnyBuilder).call(target, stripTenant(values), opts);
          const eq = (result as { eq?: (c: string, v: unknown) => AnyBuilder }).eq;
          return typeof eq === 'function' ? eq.call(result, 'tenant_id', tid) : result;
        };
      }

      if ((prop === 'select' || prop === 'delete') && typeof orig === 'function') {
        return (...args: unknown[]) => {
          const result = (orig as (...a: unknown[]) => AnyBuilder).apply(target, args);
          // El builder devuelto es un PostgrestFilterBuilder: acotamos por tenant.
          const eq = (result as { eq?: (c: string, v: unknown) => AnyBuilder }).eq;
          return typeof eq === 'function' ? eq.call(result, 'tenant_id', tid) : result;
        };
      }

      return orig;
    },
  });
}

/**
 * Devuelve un cliente acotado al tenant. Si `tenantId` es null, devuelve el
 * cliente sin tocar (passthrough). Solo intercepta `.from(tabla_de_negocio)`.
 */
export function withTenant(client: SupabaseClient, tenantId: number | null): SupabaseClient {
  if (tenantId == null) return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const builder = target.from(table) as unknown as AnyBuilder;
          if (!isTenantTable(table)) return builder;
          return guardBuilder(builder, table, tenantId);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as SupabaseClient;
}

// ---- Tenant activo del lado del navegador (una sesión = un tenant) ----------
// En el cliente, el TenantProvider fija el tenant tras el login. En el servidor
// NUNCA se setea este singleton (sería un leak entre requests): el servidor usa
// `withTenant(getServiceClient(), tenantId)` resuelto por request.
let _activeTenantId: number | null = null;

/** Arma (id) o desarma (null) el guard del cliente del navegador. */
export function setActiveTenant(id: number | null): void {
  _activeTenantId = id;
}
export function getActiveTenantId(): number | null {
  return _activeTenantId;
}

// ---- Token de Supabase por usuario (ruta de hardening, opt-in) --------------
// Si la app firma un JWT con tenant_id (SUPABASE_JWT_SECRET configurada), el
// TenantProvider lo inyecta aquí y el cliente del navegador lo usa como bearer,
// de modo que RLS (migración 003) fuerza el aislamiento en la BD. Si no hay
// token, se usa el anon de siempre. Se declara ANTES del cliente porque su fetch
// lee este valor en cada request.
let _sbToken: string | null = null;

export function setSupabaseAuthToken(token: string | null): void {
  _sbToken = token;
}

// La app NO usa Supabase Auth (sesión propia por JWT en cookie). Creamos UN SOLO
// cliente de navegador para evitar el warning "Multiple GoTrueClient instances"
// (antes se creaba un segundo cliente al fijar el token). El bearer del usuario
// se inyecta por request con un fetch propio: si hay JWT con tenant_id va en
// Authorization (apikey anon se conserva para el gateway); si no, queda el anon.
const rawBrowserClient: SupabaseClient = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init: RequestInit = {}) => {
          if (!_sbToken) return fetch(input, init);
          const headers = new Headers(init.headers);
          headers.set('Authorization', `Bearer ${_sbToken}`);
          return fetch(input, { ...init, headers });
        },
      },
    })
  : createMockClient();

function activeBrowserClient(): SupabaseClient {
  return rawBrowserClient;
}

/**
 * Cliente de Supabase para el navegador. Proxy dinámico: cada `.from()` usa el
 * cliente activo (authed si hay token, anon si no) y, una vez el TenantProvider
 * llama a `setActiveTenant(id)`, acota toda consulta al tenant del usuario.
 */
export const supabase: SupabaseClient = isConfigured
  ? (new Proxy({} as SupabaseClient, {
      get(_t, prop) {
        const client = activeBrowserClient();
        if (prop === 'from') {
          return (table: string) => {
            const tid = _activeTenantId;
            const builder = client.from(table) as unknown as AnyBuilder;
            if (tid == null || !isTenantTable(table)) return builder;
            return guardBuilder(builder, table, tid);
          };
        }
        const val = Reflect.get(client, prop);
        return typeof val === 'function' ? val.bind(client) : val;
      },
    }) as SupabaseClient)
  : rawBrowserClient;

export const supabaseConfigured = isConfigured;

let _warnedNoServiceKey = false;

/** Cliente con service role (sin acotar). Solo servidor; usar con cuidado. */
export function getServiceClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!isConfigured || !serviceKey) {
    // En producción, operar sin service role degrada a la anon key y rompe rutas
    // del servidor (admin/superadmin/login/cron…). Avisar una vez en vez de
    // fallar en silencio. En dev/local es esperado (no se hace ruido siempre).
    if (!_warnedNoServiceKey && process.env.NODE_ENV === 'production' && isConfigured && !serviceKey) {
      _warnedNoServiceKey = true;
      console.error('[config] Falta SUPABASE_SERVICE_ROLE_KEY: las rutas del servidor degradan a anon y pueden fallar.');
    }
    return rawBrowserClient;
  }
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Cliente con service role YA acotado a un tenant. Es el que deben usar las
 * rutas del servidor para no filtrar datos entre negocios.
 */
export function getTenantServiceClient(tenantId: number | null): SupabaseClient {
  return withTenant(getServiceClient(), tenantId);
}
