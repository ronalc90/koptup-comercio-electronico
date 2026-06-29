'use client';

import { useEffect, useState } from 'react';
import { Printer, X, Type, Minus, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import {
  getPrintFontSize,
  setPrintFontSize,
  getPrintCustomSizes,
  setPrintCustomSizes,
  resolvePrintSizes,
  getShowPrintLogo,
  PRINT_FONT_LABELS,
  PRINT_SIZE_MIN,
  PRINT_SIZE_MAX,
  type PrintFontSize,
  type PrintSizes,
} from '@/lib/preferences';
import { useUser } from '@/lib/UserContext';
import { useTenant } from '@/lib/TenantContext';
import { isLogoUrl } from '@/components/shared/LogoPicker';

type FontSize = PrintFontSize;

const FONT_LABELS = PRINT_FONT_LABELS;

interface OrderData {
  order_code: string;
  client_name: string;
  phone: string;
  address: string;
  complement: string;
  product_ref: string;
  detail: string;
  value_to_collect: number;
  comment: string;
  payment_timing?: 'Anticipado' | 'ContraEntrega' | 'Mixto' | 'Otro' | '';
  prepaid_amount?: number;
}

/** El despachador no debe cobrar nada si todo el pedido está pagado por anticipado. */
function isFullyPrepaid(order: OrderData): boolean {
  if (order.payment_timing === 'Anticipado') return true;
  const prepaid = order.prepaid_amount ?? 0;
  return prepaid > 0 && prepaid >= order.value_to_collect;
}

function pendingAmount(order: OrderData): number {
  const prepaid = order.prepaid_amount ?? 0;
  return Math.max(0, order.value_to_collect - prepaid);
}

interface DispatchGuideProps {
  order: OrderData;
  onClose: () => void;
}

/**
 * Before printing, add class `printing-active` to <html> and mark the
 * currently visible guide with data-print-root="1". CSS uses these to
 * isolate ONLY this guide, preventing duplicate prints when other
 * print-area elements exist elsewhere in the DOM (e.g. assistant guide modal).
 */
function printGuide(rootId: string) {
  const root = document.getElementById(rootId);
  if (!root) return;
  // Mark this as the only print target
  document.documentElement.classList.add('printing-active');
  root.setAttribute('data-print-root', '1');
  // Print
  window.print();
  // Cleanup after print dialog closes
  setTimeout(() => {
    document.documentElement.classList.remove('printing-active');
    root.removeAttribute('data-print-root');
  }, 500);
}

export default function DispatchGuide({ order, onClose }: DispatchGuideProps) {
  const owner = useUser();
  const [fontSize, setFontSizeState] = useState<FontSize>('medium');
  const [customSizes, setCustomSizesState] = useState<PrintSizes>({
    header: 11, body: 12, bold: 13, footer: 9,
  });
  const rootId = `dispatch-guide-${order.order_code || 'x'}`;

  useEffect(() => {
    setFontSizeState(getPrintFontSize(owner));
    setCustomSizesState(getPrintCustomSizes(owner));
  }, [owner]);

  function handleFontSizeChange(size: FontSize) {
    setFontSizeState(size);
    setPrintFontSize(owner, size);
  }

  function adjustCustom(key: keyof PrintSizes, delta: number) {
    const next: PrintSizes = { ...customSizes, [key]: customSizes[key] + delta };
    setCustomSizesState(next);
    setPrintCustomSizes(owner, next);
  }

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('printing-active');
    };
  }, []);

  const effectiveSizes: PrintSizes = fontSize === 'custom' ? customSizes : resolvePrintSizes(owner);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 no-print">
      <div className="w-full max-w-xs bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Guide preview — this is the ONLY print root when printing */}
        <div className="overflow-y-auto flex-1 px-4 pt-4">
          <div id={rootId} className="print-guide-root" data-font-size={fontSize}>
            <GuideCard order={order} sizes={effectiveSizes} />
          </div>
        </div>

        {/* Font size selector */}
        <div className="px-4 pt-3 pb-1 print:hidden">
          <div className="flex items-center gap-2 mb-1.5">
            <Type className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-xs font-medium text-gray-600">Tamaño de letra</span>
          </div>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {(Object.keys(FONT_LABELS) as FontSize[]).map((size) => (
              <button
                key={size}
                onClick={() => handleFontSizeChange(size)}
                className={`flex-1 rounded-lg py-1.5 text-[11px] font-semibold transition-all ${
                  fontSize === size
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {FONT_LABELS[size]}
              </button>
            ))}
          </div>

          {fontSize === 'custom' && (
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-purple-100 bg-purple-50/40 p-2">
              {(['header', 'body', 'bold', 'footer'] as const).map((k) => (
                <SizeStepper
                  key={k}
                  label={
                    k === 'header' ? 'Cabecera' :
                    k === 'body' ? 'Cuerpo' :
                    k === 'bold' ? 'Destacado' : 'Pie'
                  }
                  value={customSizes[k]}
                  onDec={() => adjustCustom(k, -0.5)}
                  onInc={() => adjustCustom(k, 0.5)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action buttons — hidden when printing */}
        <div className="flex gap-3 px-4 py-3 print:hidden">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="w-4 h-4 inline mr-1" />
            Cerrar
          </button>
          <button
            onClick={() => printGuide(rootId)}
            className="flex-[2] rounded-xl py-2.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable guide card. `sizes` se aplica como variables CSS consumidas
 * por el bloque @media print de globals.css. El preview en pantalla
 * siempre usa clases Tailwind pequeñas y legibles.
 */
export function GuideCard({
  order,
  sizes,
  fontSize,
}: {
  order: OrderData;
  sizes?: PrintSizes;
  fontSize?: FontSize;
}) {
  const owner = useUser();
  const { config } = useTenant();
  const [showLogo, setShowLogo] = useState(true);

  useEffect(() => {
    setShowLogo(getShowPrintLogo(owner));
  }, [owner]);

  const resolved: PrintSizes =
    sizes ??
    (fontSize && fontSize !== 'custom'
      ? { header: fontSize === 'small' ? 10 : fontSize === 'large' ? 12 : 11,
          body:   fontSize === 'small' ? 10 : fontSize === 'large' ? 14 : 12,
          bold:   fontSize === 'small' ? 11 : fontSize === 'large' ? 15 : 13,
          footer: fontSize === 'small' ?  8 : fontSize === 'large' ? 10 :  9 }
      : { header: 11, body: 12, bold: 13, footer: 9 });

  return (
    <div
      className="border-2 border-black guide-card mx-auto"
      style={{
        ['--guide-body' as string]: `${resolved.body}pt`,
        ['--guide-bold' as string]: `${resolved.bold}pt`,
        ['--guide-header' as string]: `${resolved.header}pt`,
        ['--guide-footer' as string]: `${resolved.footer}pt`,
        maxWidth: '220px',
      }}
    >
      {/* Header */}
      <div className="bg-black flex items-center justify-center gap-2 px-3 py-2 guide-card-header">
        {showLogo && (
          isLogoUrl(config.logo) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.logo} alt="" className="object-contain" style={{ height: `${resolved.header * 1.6}pt` }} />
          ) : (
            <span
              aria-hidden="true"
              className="leading-none"
              style={{ fontSize: `${resolved.header * 1.6}pt` }}
            >
              {config.logo}
            </span>
          )
        )}
        <div className="text-white text-center">
          <p className="font-bold leading-tight" style={{ fontSize: `${resolved.header}pt` }}>{config.name}</p>
        </div>
      </div>

      <div className="border-b-2 border-black" />

      {/* Body — stacked rows, each with word-wrap */}
      <div className="guide-card-body">
        <GuideRow value={order.order_code} bold bodyPt={resolved.body} boldPt={resolved.bold} />
        <GuideRow value={order.client_name} bodyPt={resolved.body} boldPt={resolved.bold} />
        <GuideRow value={order.phone} bodyPt={resolved.body} boldPt={resolved.bold} />
        <GuideRow value={order.address} bodyPt={resolved.body} boldPt={resolved.bold} />
        <GuideRow value={order.complement} bodyPt={resolved.body} boldPt={resolved.bold} />
        <GuideRow value={order.product_ref} bodyPt={resolved.body} boldPt={resolved.bold} />
        <GuideRow value={order.detail} bodyPt={resolved.body} boldPt={resolved.bold} />
        {isFullyPrepaid(order) ? (
          <div className="border-b-2 border-black px-2 py-1.5 bg-emerald-100" style={{ textAlign: 'center' }}>
            <p
              className="font-black uppercase tracking-wide text-emerald-800"
              style={{ fontSize: `${resolved.bold}pt`, lineHeight: 1.1 }}
            >
              YA PAGADO
            </p>
            <p className="text-gray-700" style={{ fontSize: `${resolved.footer}pt` }}>
              No recaudar: {formatCurrency(order.value_to_collect)}
            </p>
          </div>
        ) : order.payment_timing === 'Mixto' && (order.prepaid_amount ?? 0) > 0 ? (
          <>
            <div className="border-b border-amber-400 px-2 py-1 bg-amber-50">
              <p className="font-bold text-amber-900" style={{ fontSize: `${resolved.body}pt` }}>
                Abono: {formatCurrency(order.prepaid_amount ?? 0)}
              </p>
            </div>
            <GuideRow
              value={`Saldo a cobrar: ${formatCurrency(pendingAmount(order))}`}
              bold
              bodyPt={resolved.body}
              boldPt={resolved.bold}
            />
          </>
        ) : (
          <GuideRow
            value={formatCurrency(order.value_to_collect)}
            bold
            bodyPt={resolved.body}
            boldPt={resolved.bold}
          />
        )}
        <GuideRow value={order.comment} bodyPt={resolved.body} boldPt={resolved.bold} />
      </div>

      {/* Footer */}
      {config.phone && (
        <div className="border-t-2 border-black px-2 py-1 text-center guide-card-footer">
          <p className="font-semibold text-gray-700 leading-tight" style={{ fontSize: `${resolved.footer}pt`, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>Mayor Información</p>
          <p className="font-bold text-gray-900 leading-tight" style={{ fontSize: `${resolved.footer}pt`, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{config.phone}</p>
        </div>
      )}
    </div>
  );
}

function GuideRow({ value, bold, bodyPt, boldPt }: { value: string | number; bold?: boolean; bodyPt?: number; boldPt?: number }) {
  const display = value === 0 ? '$0' : value;
  if (!display) return null;
  const size = bold ? boldPt : bodyPt;
  return (
    <div className="border-b border-gray-300 px-2 py-1 guide-row">
      <p
        className={`${bold ? 'font-bold text-black' : 'text-gray-900'}`}
        style={{
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          fontSize: size ? `${size}pt` : undefined,
        }}
      >
        {String(display)}
      </p>
    </div>
  );
}

function SizeStepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
}) {
  const atMin = value <= PRINT_SIZE_MIN;
  const atMax = value >= PRINT_SIZE_MAX;
  return (
    <div className="rounded-lg bg-white border border-purple-100 px-2 py-1.5">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDec}
          disabled={atMin}
          aria-label={`Disminuir ${label}`}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-40"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          {value.toFixed(1)}<span className="text-[10px] font-normal text-gray-500">pt</span>
        </span>
        <button
          type="button"
          onClick={onInc}
          disabled={atMax}
          aria-label={`Aumentar ${label}`}
          className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
