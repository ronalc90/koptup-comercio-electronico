import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { isTenantSupported } from '@/lib/db';
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

  return (
    <UserProvider username={session.username}>
      <TenantProvider
        tenantId={session.tenantId}
        tenantSlug={session.tenantSlug}
        role={session.role}
        armed={armed}
      >
        <PrefsApplier />
        <AppShell>{children}</AppShell>
      </TenantProvider>
    </UserProvider>
  );
}
