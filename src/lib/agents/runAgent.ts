import { NextResponse } from 'next/server';
import { getRequestScopedClient } from '../tenantServer';
import { loadTenantData } from './data';
import type { AgentReport, AgentMeta, TenantData } from './types';

type Analyzer = (data: TenantData, meta: AgentMeta) => Omit<AgentReport, 'generatedAt'>;

/**
 * Ejecuta un analizador puro contra los datos del tenant del usuario. El
 * cliente viene ya acotado al tenant: el agente NUNCA ve datos de otro negocio.
 */
export async function runAgent(analyzer: Analyzer): Promise<Response> {
  try {
    const scoped = await getRequestScopedClient();
    if (!scoped) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const { ctx, client } = scoped;
    const data = await loadTenantData(client);
    const meta: AgentMeta = { tenantId: ctx.tenantId, tenantSlug: ctx.tenantSlug };
    const report: AgentReport = { ...analyzer(data, meta), generatedAt: new Date().toISOString() };
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
