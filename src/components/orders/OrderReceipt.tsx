'use client';

import { useEffect, useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { isLogoUrl } from '@/components/shared/LogoPicker';
import { formatCurrency } from '@/lib/utils';
import { qrSvg, catalogUrl } from '@/lib/qr';
import { useModalA11y } from '@/components/shared/useModalA11y';

export interface ReceiptOrder {
  order_code: string;
  client_name: string;
  phone: string;
  city: string;
  address: string;
  complement?: string;
  product_ref?: string;
  detail?: string;
  quantity?: number | null;
  value_to_collect: number;
  order_date: string;
}

/**
 * RECIBO imprimible para ALISTAMIENTO (Fase C). Distinto de la guía de despacho:
 * lo usa quien alista el pedido en bodega. Muestra cliente + detalle del pedido +
 * marca del negocio + un QR que lleva al catálogo público del tenant. Reutiliza
 * el patrón de impresión aislada de las guías (html.printing-active + data-print-root).
 */
const RECEIPT_ROOT_ID = 'order-receipt-root';

function printReceipt() {
  const root = document.getElementById(RECEIPT_ROOT_ID);
  if (!root) return;
  document.documentElement.classList.add('printing-active');
  root.setAttribute('data-print-root', '1');
  window.print();
  setTimeout(() => {
    document.documentElement.classList.remove('printing-active');
    root.removeAttribute('data-print-root');
  }, 500);
}

export default function OrderReceipt({ order, onClose }: { order: ReceiptOrder; onClose: () => void }) {
  const { config } = useTenant();
  const [qr, setQr] = useState<string>('');
  useModalA11y(onClose);

  const url = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return config.slug ? catalogUrl(config.slug, origin) : '';
  }, [config.slug]);

  useEffect(() => {
    let active = true;
    if (url) qrSvg(url, { width: 140, margin: 0 }).then((svg) => { if (active) setQr(svg); }).catch(() => {});
    return () => { active = false; };
  }, [url]);

  const qty = order.quantity && order.quantity > 1 ? order.quantity : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print" onClick={onClose}>
      <div
        className="w-full max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Recibo (único root de impresión) */}
        <div id={RECEIPT_ROOT_ID} className="print-guide-root overflow-y-auto p-4 text-[12px] text-gray-900">
          {/* Marca */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
            {isLogoUrl(config.logo)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={config.logo} alt="" className="h-8 w-8 rounded object-cover" />
              : <span className="text-2xl" aria-hidden="true">{config.logo}</span>}
            <div className="min-w-0">
              <p className="font-bold leading-tight">{config.name}</p>
              {config.phone && <p className="text-[11px] text-gray-500">{config.phone}</p>}
            </div>
          </div>

          <p className="mt-2 text-center text-[13px] font-bold tracking-wide">RECIBO DE ALISTAMIENTO</p>
          <div className="mt-1 flex justify-between text-[11px] text-gray-600">
            <span>#{order.order_code}</span>
            <span>{order.order_date}</span>
          </div>

          {/* Cliente */}
          <div className="mt-2 border-t border-gray-200 pt-2 space-y-0.5">
            <p><span className="font-semibold">Cliente:</span> {order.client_name}</p>
            {order.phone && <p><span className="font-semibold">Tel:</span> {order.phone}</p>}
            {(order.address || order.city) && (
              <p><span className="font-semibold">Dirección:</span> {[order.address, order.complement, order.city].filter(Boolean).join(', ')}</p>
            )}
          </div>

          {/* Detalle del pedido */}
          <div className="mt-2 border-t border-gray-200 pt-2 space-y-0.5">
            {order.product_ref && <p><span className="font-semibold">Producto:</span> {order.product_ref}</p>}
            {order.detail && <p><span className="font-semibold">Detalle:</span> {order.detail}</p>}
            {qty && <p><span className="font-semibold">Cantidad:</span> {qty}</p>}
            <p className="text-[13px] font-bold">Total: {formatCurrency(order.value_to_collect)}</p>
          </div>

          {/* QR al catálogo */}
          {qr && (
            <div className="mt-3 border-t border-gray-200 pt-2 flex flex-col items-center">
              <div className="h-[120px] w-[120px]" dangerouslySetInnerHTML={{ __html: qr }} />
              <p className="mt-1 text-[10px] text-gray-500 text-center">Escanea para ver nuestro catálogo</p>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="flex gap-2 border-t border-gray-100 p-3 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
          <button
            onClick={printReceipt}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
          >
            <Printer className="h-4 w-4" /> Imprimir recibo
          </button>
        </div>
      </div>
    </div>
  );
}
