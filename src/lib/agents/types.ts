/**
 * Contrato común de los agentes IA (Fase 2).
 *
 * Cada agente es una FUNCIÓN PURA `(data, ctx) => AgentReport` sobre los datos
 * del tenant. Que sean puras las hace testeables y deterministas (sin depender
 * de una llamada a un LLM). El endpoint solo carga datos acotados al tenant y
 * delega en el analizador.
 */
import type { Order, Product, InventoryItem } from '../types';

export type Severity = 'info' | 'warning' | 'critical';

export interface Finding {
  /** Clave estable para deduplicar / referenciar. */
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Entidad afectada (ej. "pedido #123", "Pantufla Rosa"). */
  entity?: string;
  /** Valor numérico de apoyo (monto, cantidad, etc.). */
  value?: number;
}

export type AgentKey = 'auditor' | 'qa' | 'inventario' | 'financiero' | 'comercial';

export interface AgentReport {
  agent: AgentKey;
  tenantId: number;
  /** ISO timestamp; lo estampa el endpoint, no el analizador (purity). */
  generatedAt: string;
  summary: string;
  findings: Finding[];
  /** Conteo por severidad para pintar badges rápido. */
  counts: Record<Severity, number>;
}

/** Datos del tenant que reciben los analizadores. */
export interface TenantData {
  orders: Order[];
  products: Product[];
  inventory: InventoryItem[];
  expenses: ExpenseRow[];
}

export interface ExpenseRow {
  id: number;
  description: string;
  amount: number;
  category: string;
  expense_date: string;
  owner?: string;
}

/** Metadatos para enriquecer el reporte (no afecta el cálculo). */
export interface AgentMeta {
  tenantId: number;
  tenantSlug: string;
}

export function countSeverities(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { info: 0, warning: 0, critical: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

/** Helper para que un analizador arme su reporte de forma uniforme. */
export function buildReport(
  agent: AgentKey,
  meta: AgentMeta,
  summary: string,
  findings: Finding[],
): Omit<AgentReport, 'generatedAt'> {
  return {
    agent,
    tenantId: meta.tenantId,
    summary,
    findings,
    counts: countSeverities(findings),
  };
}
