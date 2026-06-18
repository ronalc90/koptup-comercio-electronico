import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isTenantSupported } from '@/lib/db';
import { mintSupabaseToken, supabaseJwtSecret } from '@/lib/supabaseJwt';
import { getServiceClient } from '@/lib/supabase';
import type { TenantConfigOverrides } from '@/lib/tenants.config';
import AppShell from '@/components/layout/AppShell';
import { UserProvider } from '@/lib/UserContext';
import { TenantProvider } from '@/lib/TenantContext';
import PrefsApplier from '@/components/shared/PrefsApplier';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // El guard multi-tenant solo se arma si la migración 002 ya corrió. Pre-
  // migración la app se comporta exactamente como antes.
  const armed = await isTenantSupported();

  // Hardening opt-in: si hay JWT secret, firmamos un token con tenant_id para
  // que RLS (migración 003) fuerce el aislamiento en la BD. Si no, queda null y
  // el cliente del navegador sigue con la anon key.
  const secret = supabaseJwtSecret();
  const sbToken = secret
    ? await mintSupabaseToken(
        { userId: session.userId, tenantId: session.tenantId, email: session.email },
        secret,
      )
    : null;

  // Config propia del negocio (categorías/marca/tema/IA) guardada en BD. Se lee
  // fresca por request (no va en el JWT) para que un cambio del superadmin
  // aplique sin re-login. Null ⇒ el cliente usa el base estático/genérico.
  let configOverrides: TenantConfigOverrides | null = null;
  if (armed) {
    const { data: tenantRow } = await getServiceClient()
      .from('tenants')
      .select('config')
      .eq('id', session.tenantId)
      .maybeSingle();
    configOverrides = (tenantRow?.config as TenantConfigOverrides | null) ?? null;
  }

  return (
    <UserProvider username={session.username}>
      <TenantProvider
        tenantId={session.tenantId}
        tenantSlug={session.tenantSlug}
        tenantName={session.tenantName}
        tenantLogo={session.tenantLogo}
        configOverrides={configOverrides}
        role={session.role}
        armed={armed}
        sbToken={sbToken}
      >
        <PrefsApplier />
        <AppShell>{children}</AppShell>
      </TenantProvider>
    </UserProvider>
  );
}
