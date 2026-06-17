import type { TenantData, AgentMeta, AgentReport } from './types';
import { analyzeAuditor } from './auditor';
import { analyzeQa } from './qa';
import { analyzeInventario } from './inventario';
import { analyzeFinanciero } from './financiero';
import { analyzeComercial } from './comercial';

/** Los 5 analizadores en orden estable. */
export const ANALYZERS = [
  analyzeAuditor,
  analyzeQa,
  analyzeInventario,
  analyzeFinanciero,
  analyzeComercial,
];

/** Corre los 5 agentes sobre los datos del tenant y estampa la hora. */
export function analyzeAll(data: TenantData, meta: AgentMeta, now: string): AgentReport[] {
  return ANALYZERS.map((fn) => ({ ...fn(data, meta), generatedAt: now }));
}
