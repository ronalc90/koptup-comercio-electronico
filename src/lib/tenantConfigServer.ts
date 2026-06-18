import { getServiceClient } from './supabase';
import { resolveTenantConfig, type TenantConfig, type TenantConfigOverrides } from './tenants.config';

/**
 * Config EFECTIVA de un negocio resuelta en el SERVIDOR (lee los overrides de la
 * columna `tenants.config`). Es lo que deben usar las rutas /api y los agentes
 * para especializar la IA, categorías y marca por tenant — no el getTenantConfig
 * estático, que solo conoce meraki/primeramayo. Nunca lanza: ante cualquier
 * fallo devuelve el base estático/genérico del slug.
 */
export async function loadTenantConfig(
  tenantId: number,
  slug: string,
  name?: string | null,
  logo?: string | null,
): Promise<TenantConfig> {
  try {
    const { data } = await getServiceClient()
      .from('tenants')
      .select('config, name, logo')
      .eq('id', tenantId)
      .maybeSingle();
    return resolveTenantConfig(
      slug,
      (data?.config as TenantConfigOverrides | null) ?? null,
      name ?? (data?.name as string | undefined),
      logo ?? (data?.logo as string | undefined),
    );
  } catch {
    return resolveTenantConfig(slug, null, name, logo);
  }
}
