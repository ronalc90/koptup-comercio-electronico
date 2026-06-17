'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { setActiveTenant, setSupabaseAuthToken } from './supabase';
import { getTenantConfig, type TenantConfig } from './tenants.config';
import type { Role } from './tenant';

export interface TenantClientContext {
  tenantId: number;
  tenantSlug: string;
  role: Role;
  config: TenantConfig;
}

const Ctx = createContext<TenantClientContext | null>(null);

interface ProviderProps {
  tenantId: number;
  tenantSlug: string;
  /** Nombre/logo reales del tenant (BD) — para negocios creados al vuelo. */
  tenantName?: string;
  tenantLogo?: string;
  role: Role;
  /** true solo si la migración multi-tenant ya corrió (columna tenant_id). */
  armed: boolean;
  /** JWT de Supabase con tenant_id (hardening opt-in). null si no aplica. */
  sbToken?: string | null;
  children: React.ReactNode;
}

export function TenantProvider({ tenantId, tenantSlug, tenantName, tenantLogo, role, armed, sbToken = null, children }: ProviderProps) {
  // Arma el guard del navegador (y el token de Supabase, si hay) en el PRIMER
  // render (síncrono, vía el inicializador perezoso de useState) — así queda
  // listo antes de que los hijos ejecuten sus efectos de carga de datos.
  // Solo en el navegador: en el servidor el singleton jamás debe tocarse,
  // porque sería un leak de tenant entre requests.
  useState(() => {
    if (typeof window !== 'undefined') {
      setSupabaseAuthToken(sbToken);
      setActiveTenant(armed ? tenantId : null);
    }
    return null;
  });

  // El tema/categorías salen de la config estática por slug; el nombre y el
  // logo se sobreescriben con los reales de BD (así un tenant creado al vuelo
  // muestra SU marca, no la de meraki).
  const config = useMemo<TenantConfig>(() => {
    const base = getTenantConfig(tenantSlug);
    return { ...base, name: tenantName || base.name, logo: tenantLogo || base.logo };
  }, [tenantSlug, tenantName, tenantLogo]);

  useEffect(() => {
    setSupabaseAuthToken(sbToken);
    setActiveTenant(armed ? tenantId : null);
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', config.theme.primary);
    root.style.setProperty('--brand-primary-dark', config.theme.primaryDark);
    root.style.setProperty('--brand-primary-light', config.theme.primaryLight);
  }, [armed, tenantId, sbToken, config.theme.primary, config.theme.primaryDark, config.theme.primaryLight]);

  return <Ctx.Provider value={{ tenantId, tenantSlug, role, config }}>{children}</Ctx.Provider>;
}

export function useTenant(): TenantClientContext {
  const v = useContext(Ctx);
  if (!v) {
    // Fallback defensivo: fuera del layout protegido no hay provider.
    return { tenantId: 1, tenantSlug: 'meraki', role: 'admin', config: getTenantConfig('meraki') };
  }
  return v;
}
