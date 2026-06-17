/**
 * Agente Financiero — calcula utilidad y margen, detecta pérdidas y analiza el
 * recaudo (pendiente de liquidación / por cobrar).
 */
import { buildReport, type AgentMeta, type Finding } from './types';
import type { TenantData } from './types';
import { getCourierPending } from '../types';

function realized(o: TenantData['orders'][number]): number {
  return (o.payment_cash || 0) + (o.payment_transfer || 0) + getCourierPending(o) + (o.prepaid_amount || 0);
}

export function analyzeFinanciero(data: TenantData, meta: AgentMeta) {
  const findings: Finding[] = [];
  const { orders, expenses } = data;

  let revenue = 0, productCost = 0, operating = 0;
  let pendingCourier = 0, receivable = 0;

  for (const o of orders) {
    if (o.delivery_status === 'Cancelado') continue;
    const income = realized(o);
    revenue += income;
    productCost += o.product_cost || 0;
    operating += o.operating_cost || 0;
    pendingCourier += getCourierPending(o);

    // Por cobrar: entregado con saldo pendiente.
    if ((o.delivery_status === 'Entregado') && (o.value_to_collect || 0) > income) {
      receivable += (o.value_to_collect || 0) - income;
    }

    // Pérdida por pedido.
    const net = income - (o.product_cost || 0) - (o.operating_cost || 0);
    if (income > 0 && net < 0) {
      findings.push({
        id: `loss-${o.id}`, severity: 'critical', title: 'Pedido con pérdida',
        detail: `Neto ${net} (ingreso ${income} − costos ${(o.product_cost || 0) + (o.operating_cost || 0)}).`,
        entity: `pedido #${o.id}`, value: net,
      });
    }
  }

  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const profit = revenue - productCost - operating - totalExpenses;
  const margin = revenue > 0 ? profit / revenue : 0;

  findings.push({
    id: 'utilidad', severity: profit >= 0 ? 'info' : 'critical', title: 'Utilidad neta',
    detail: `Ingresos ${revenue} − costos ${productCost} − operación ${operating} − gastos ${totalExpenses}.`,
    entity: 'Periodo', value: profit,
  });
  findings.push({
    id: 'margen', severity: margin < 0.1 ? 'warning' : 'info', title: 'Margen neto',
    detail: `${(margin * 100).toFixed(1)}% sobre ingresos.`, entity: 'Periodo', value: Math.round(margin * 1000) / 10,
  });
  if (pendingCourier > 0) findings.push({
    id: 'pdte-mensajero', severity: 'info', title: 'Pendiente de liquidación (mensajero)',
    detail: `El mensajero/courier debe liquidar ${pendingCourier}.`, entity: 'Recaudo', value: pendingCourier,
  });
  if (receivable > 0) findings.push({
    id: 'por-cobrar', severity: 'warning', title: 'Saldo por cobrar',
    detail: `Pedidos entregados con saldo pendiente: ${receivable}.`, entity: 'Recaudo', value: receivable,
  });

  const summary = `Utilidad ${profit} · margen ${(margin * 100).toFixed(1)}% · ${findings.filter((f) => f.id.startsWith('loss-')).length} pedido(s) con pérdida.`;
  return buildReport('financiero', meta, summary, findings);
}
