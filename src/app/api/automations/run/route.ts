import { NextResponse } from 'next/server';
import { getRequestScopedClient } from '@/lib/tenantServer';
import { loadTenantData } from '@/lib/agents/data';
import { analyzeAll } from '@/lib/agents/all';
import { runAutomations } from '@/lib/automations/engine';
import type { AutomationResult } from '@/lib/automations/types';

export const dynamic = 'force-dynamic';

/**
 * Corre los 5 agentes sobre los datos del tenant y produce alertas accionables.
 * El cliente viene acotado al tenant: nunca ve datos de otro negocio.
 */
export async function GET() {
  try {
    const scoped = await getRequestScopedClient();
    if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const { ctx, client } = scoped;
    const data = await loadTenantData(client);
    const meta = { tenantId: ctx.tenantId, tenantSlug: ctx.tenantSlug };
    const now = new Date().toISOString();
    const reports = analyzeAll(data, meta, now);
    const result: AutomationResult = { ...runAutomations(data, reports, meta), generatedAt: now };
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    console.error('Automations run error:', msg);
    return NextResponse.json({ error: 'No se pudieron correr las automatizaciones' }, { status: 500 });
  }
}
