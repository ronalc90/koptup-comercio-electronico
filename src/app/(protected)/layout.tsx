import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isTenantSupported } from '@/lib/db';
import { mintSupabaseToken, supabaseJwtSecret } from '@/lib/supabaseJwt';
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

  return (
    <UserProvider username={session.username}>
      <TenantProvider
        tenantId={session.tenantId}
        tenantSlug={session.tenantSlug}
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
