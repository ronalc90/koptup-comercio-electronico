/**
 * Motor de automatizaciones (Fase 3): convierte los hallazgos de los agentes +
 * los datos del tenant en ALERTAS accionables (reposición, stock, ventas,
 * devoluciones, garantías, finanzas, datos). Es una función pura → testeable.
 */
import type { Severity, AgentKey } from '../agents/types';

export type AlertKind =
  | 'reposicion'
  | 'stock'
  | 'ventas'
  | 'devoluciones'
  | 'garantias'
  | 'finanzas'
  | 'datos';

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  title: string;
  message: string;
  /** Acción sugerida para resolver la alerta. */
  suggestedAction?: string;
  value?: number;
  source: AgentKey;
}

export interface AutomationResult {
  tenantId: number;
  generatedAt: string;
  alerts: Alert[];
  counts: Record<Severity, number>;
}
