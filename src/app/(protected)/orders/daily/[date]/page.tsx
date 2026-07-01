'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { Order, DailyKPIs } from '@/lib/types'
import { cn, formatCurrency, getDayOfWeek, sameVendor, vendorDisplayName } from '@/lib/utils'
import { phaseLabel } from '@/lib/orders/phases'
import { useUser } from '@/lib/UserContext'
import { isOwnerSupported, courierPendingColumn, isOrderShippingSupported } from '@/lib/db'
import WhatsAppLink from '@/components/shared/WhatsAppLink'
import OrderReceipt from '@/components/orders/OrderReceipt'
import { DELIVERY_TYPE_OPTIONS as DELIVERY_TYPE_DEFS, getCourierPending } from '@/lib/types'

const DELIVERY_STATUS_OPTIONS = ['Confirmado', 'EnAlistamiento', 'Alistado', 'Enviado', 'Entregado', 'Pagado', 'Devolucion', 'Cancelado'] as const

/**
 * Deriva las opciones de vendedor a partir de los datos reales: los valores
 * `vendor` distintos ya presentes en los pedidos del día, más el usuario
 * actual. Se deduplica de forma insensible a mayúsculas/espacios y se ordena
 * alfabéticamente. Si no hay datos, queda solo el usuario actual. Nunca se
 * asume una vendedora fija (la app es multi-tenant).
 */
function buildVendorOptions(orders: Order[], currentUser: string): string[] {
  const byKey = new Map<string, string>()
  const add = (raw: string | null | undefined) => {
    const value = (raw ?? '').trim()
    if (!value) return
    const key = value.toLowerCase()
    if (!byKey.has(key)) byKey.set(key, value)
  }
  add(currentUser)
  for (const o of orders) add(o.vendor)
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, 'es'))
}

function padDate(n: number) {
  return String(n).padStart(2, '0')
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${padDate(d.getMonth() + 1)}-${padDate(d.getDate())}`
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function SupabaseBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>Supabase no está configurado. Los datos mostrados son de ejemplo.</span>
    </div>
  )
}

interface KPIItemProps {
  label: string
  value: string | number
  small?: boolean
}

function KPIItem({ label, value, small }: KPIItemProps) {
  return (
    <div className="flex flex-col">
      <span className={cn('text-gray-500', small ? 'text-[10px]' : 'text-xs')}>{label}</span>
      <span className={cn('font-bold text-gray-900', small ? 'text-sm' : 'text-base')}>{value}</span>
    </div>
  )
}

function computeKPIs(orders: Order[], currentUser: string): DailyKPIs {
  const delivered = orders.filter((o) => o.delivery_status === 'Entregado')
  const active = orders.filter((o) => o.delivery_status === 'Confirmado' || o.delivery_status === 'Entregado')
  return {
    totalOrders: orders.length,
    // Acepta valores legacy + canónicos v1.012 para no perder pedidos viejos
    deliveredCourier: orders.filter((o) => o.delivery_status === 'Entregado' && (o.delivery_type === 'Mensajeria' || o.delivery_type === 'Bogo')).length,
    deliveredPickup: orders.filter((o) => o.delivery_status === 'Entregado' && (o.delivery_type === 'Recogida' || o.delivery_type === 'Bodega')).length,
    deliveredOther: orders.filter((o) => o.delivery_status === 'Entregado' && (o.delivery_type === 'Otro' || o.delivery_type === 'Otros')).length,
    returns: orders.filter((o) => o.delivery_status === 'Devolucion').length,
    exchanges: orders.filter((o) => o.is_exchange).length,
    cancelled: orders.filter((o) => o.delivery_status === 'Cancelado').length,
    revenueCourierPending: delivered.reduce((s, o) => s + getCourierPending(o), 0),
    revenueCash: delivered.reduce((s, o) => s + (o.payment_cash ?? 0), 0),
    revenueTransfer: delivered.reduce((s, o) => s + (o.payment_transfer ?? 0), 0),
    totalRevenue: delivered.reduce((s, o) => s + (o.value_to_collect ?? 0), 0),
    ordersOwner: orders.filter((o) => sameVendor(o.vendor, currentUser)).length,
    totalCosts: active.reduce((s, o) => s + (o.product_cost ?? 0), 0),
    totalOperatingCosts: active.reduce((s, o) => s + (o.operating_cost ?? 0), 0),
    profit:
      active.reduce((s, o) => s + (o.value_to_collect ?? 0), 0) -
      active.reduce((s, o) => s + (o.product_cost ?? 0) + (o.operating_cost ?? 0), 0),
  }
}

const STATUS_COLORS: Record<string, string> = {
  Confirmado: 'bg-blue-100 text-blue-700',
  EnAlistamiento: 'bg-indigo-100 text-indigo-700',
  Alistado: 'bg-cyan-100 text-cyan-700',
  Enviado: 'bg-purple-100 text-purple-700',
  Entregado: 'bg-amber-100 text-amber-700',
  Pagado: 'bg-emerald-100 text-emerald-700',
  Devolucion: 'bg-orange-100 text-orange-700',
  Cancelado: 'bg-red-100 text-red-600',
}

interface OrderRowBaseProps {
  order: Order
  onUpdate: (id: number, changes: Partial<Order>) => Promise<void>
  vendorOptions: string[]
  onReceipt: (order: Order) => void
  /** Fases de alistamiento disponibles (migración 018 aplicada). */
  phasesEnabled: boolean
}

/** Opciones de estado según haya migración de fases (018) o no. */
function statusOptionsFor(phasesEnabled: boolean): readonly string[] {
  return phasesEnabled
    ? DELIVERY_STATUS_OPTIONS
    : DELIVERY_STATUS_OPTIONS.filter((s) => s !== 'EnAlistamiento' && s !== 'Alistado')
}

function useOrderRowState(order: Order, onUpdate: OrderRowBaseProps['onUpdate']) {
  const [saving, setSaving] = useState(false)

  async function handleChange<K extends keyof Order>(field: K, value: Order[K]) {
    setSaving(true)
    try {
      await onUpdate(order.id, { [field]: value } as Partial<Order>)
    } finally {
      setSaving(false)
    }
  }

  return { saving, handleChange }
}

function vendorOptionsWith(order: Order, vendorOptions: string[]): string[] {
  const current = (order.vendor ?? '').trim()
  if (!current || vendorOptions.some((v) => sameVendor(v, current))) return vendorOptions
  return [...vendorOptions, current]
}

function OrderTableRow({ order, onUpdate, vendorOptions, onReceipt, phasesEnabled }: OrderRowBaseProps) {
  const { saving, handleChange } = useOrderRowState(order, onUpdate)
  const options = vendorOptionsWith(order, vendorOptions)

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3 text-xs font-mono text-purple-600 font-medium whitespace-nowrap">
        {order.order_code}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-800 text-sm leading-tight">{order.client_name}</div>
        <WhatsAppLink phone={order.phone} className="text-xs text-green-600 hover:text-green-700 hover:underline" />
      </td>
      <td className="px-4 py-3 text-xs text-gray-600 max-w-[140px] truncate">{order.address}</td>
      <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px]">
        <span className="line-clamp-2">{order.detail}</span>
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-gray-800 whitespace-nowrap">
        {formatCurrency(order.value_to_collect)}
      </td>
      <td className="px-4 py-3">
        <select
          value={order.delivery_status}
          onChange={(e) =>
            handleChange('delivery_status', e.target.value as Order['delivery_status'])
          }
          disabled={saving}
          className={cn(
            'rounded-lg border-0 px-2 py-1 text-xs font-medium outline-none cursor-pointer disabled:opacity-60',
            STATUS_COLORS[order.delivery_status] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {statusOptionsFor(phasesEnabled).map((s) => (
            <option key={s} value={s}>
              {phaseLabel(s)}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={order.delivery_type}
          onChange={(e) =>
            handleChange('delivery_type', e.target.value as Order['delivery_type'])
          }
          disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none cursor-pointer disabled:opacity-60"
        >
          <option value="">—</option>
          {DELIVERY_TYPE_DEFS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select
          value={order.vendor}
          onChange={(e) => handleChange('vendor', e.target.value)}
          disabled={saving}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none cursor-pointer disabled:opacity-60"
        >
          {options.map((v) => (
            <option key={v} value={v}>
              {v || '—'}
            </option>
          ))}
        </select>
        <button
          onClick={() => onReceipt(order)}
          className="mt-1 block w-full rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
        >
          Recibo
        </button>
        {order.tracking_number && (
          <p className="mt-1 text-[10px] text-gray-400 truncate" title={`${order.carrier ?? ''} ${order.tracking_status ?? ''}`}>
            Guía {order.tracking_number}
          </p>
        )}
      </td>
    </tr>
  )
}

function OrderMobileCard({ order, onUpdate, vendorOptions, onReceipt, phasesEnabled }: OrderRowBaseProps) {
  const [expanded, setExpanded] = useState(false)
  const { saving, handleChange } = useOrderRowState(order, onUpdate)
  const options = vendorOptionsWith(order, vendorOptions)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <button
        className="w-full flex items-start justify-between gap-3 p-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-purple-600">{order.order_code}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                STATUS_COLORS[order.delivery_status] ?? 'bg-gray-100 text-gray-600',
              )}
            >
              {order.delivery_status}
            </span>
          </div>
          <p className="mt-0.5 font-semibold text-gray-800 text-sm">{order.client_name}</p>
          <p className="text-xs text-gray-500 truncate">{order.address}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold text-gray-900">{formatCurrency(order.value_to_collect)}</p>
          <p className="text-xs text-gray-400">{order.vendor || '—'}</p>
        </div>
        <span className="shrink-0 self-center text-gray-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500">Teléfono</p>
              <WhatsAppLink phone={order.phone} className="font-medium text-green-600 hover:text-green-700 underline decoration-green-300 underline-offset-2" />
            </div>
            <div>
              <p className="text-gray-500">Ciudad</p>
              <p className="font-medium text-gray-800">{order.city || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Detalle</p>
              <p className="font-medium text-gray-800">{order.detail || '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Comentario</p>
              <p className="font-medium text-gray-800">{order.comment || '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <label className="block text-[10px] text-gray-500">Estado</label>
              <select
                value={order.delivery_status}
                onChange={(e) =>
                  handleChange('delivery_status', e.target.value as Order['delivery_status'])
                }
                disabled={saving}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
              >
                {statusOptionsFor(phasesEnabled).map((s) => (
                  <option key={s} value={s}>
                    {phaseLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="block text-[10px] text-gray-500">Tipo</label>
              <select
                value={order.delivery_type}
                onChange={(e) =>
                  handleChange('delivery_type', e.target.value as Order['delivery_type'])
                }
                disabled={saving}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
              >
                <option value="">—</option>
                {DELIVERY_TYPE_DEFS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="block text-[10px] text-gray-500">Vendedora</label>
              <select
                value={order.vendor}
                onChange={(e) => handleChange('vendor', e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
              >
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v || '—'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment methods — visible when delivered */}
          {order.delivery_status === 'Entregado' && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Método de pago</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-gray-500" title="Efectivo recaudado por el mensajero, pendiente de liquidación">Mensajero</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={getCourierPending(order) || ''}
                    onChange={(e) => handleChange('payment_courier_pending', Number(e.target.value) || 0)}
                    disabled={saving}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-gray-500">Caja</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={order.payment_cash || ''}
                    onChange={(e) => handleChange('payment_cash', Number(e.target.value) || 0)}
                    disabled={saving}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="block text-[10px] text-gray-500">Transferencia</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={order.payment_transfer || ''}
                    onChange={(e) => handleChange('payment_transfer', Number(e.target.value) || 0)}
                    disabled={saving}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none"
                  />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-gray-400">
                Valor a cobrar: {formatCurrency(order.value_to_collect)} · Registrado: {formatCurrency(getCourierPending(order) + (order.payment_cash || 0) + (order.payment_transfer || 0))}
              </p>
            </div>
          )}

          {order.tracking_number && (
            <p className="text-[10px] text-gray-400">
              Guía: <span className="font-mono text-gray-600">{order.tracking_number}</span>
              {order.carrier ? ` · ${order.carrier}` : ''}
              {order.tracking_status ? ` · ${order.tracking_status}` : ''}
            </p>
          )}

          <button
            onClick={() => onReceipt(order)}
            className="w-full rounded-lg border border-purple-200 bg-purple-50 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100"
          >
            Imprimir recibo
          </button>

          {saving && (
            <p className="text-xs text-purple-500 text-center">Guardando...</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function DailyOrdersPage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const owner = useUser()
  const { date } = use(params)
  const router = useRouter()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [supabaseOk, setSupabaseOk] = useState(true)
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [phasesEnabled, setPhasesEnabled] = useState(false)

  useEffect(() => { isOrderShippingSupported().then(setPhasesEnabled).catch(() => {}) }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const hasOwner = await isOwnerSupported()
      let query = supabase.from('orders').select('*')
      if (hasOwner) query = query.eq('owner', owner)
      query = query.eq('order_date', date).order('created_at', { ascending: true })
      const { data, error } = await query

      if (error) throw error
      setOrders(data ?? [])
      setSupabaseOk(true)
    } catch {
      setOrders([])
      setSupabaseOk(false)
    } finally {
      setLoading(false)
    }
  }, [date, owner])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  async function handleUpdateOrder(id: number, changes: Partial<Order>) {
    try {
      // DESPACHO: al pasar a 'Enviado' enrutamos por la API, que crea la guía de
      // transportadora y guarda el tracking (lógica server-side, credenciales).
      if (changes.delivery_status === 'Enviado') {
        const res = await fetch('/api/orders/phase', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'Enviado' }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw new Error(data?.error || 'No se pudo despachar')
        const o = data?.order ?? {}
        setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, delivery_status: 'Enviado', carrier: o.carrier, tracking_number: o.tracking_number, tracking_status: o.tracking_status, guide_number: o.guide_number ?? x.guide_number, dispatch_date: o.dispatch_date ?? x.dispatch_date } : x)))
        toast.success(o.tracking_number ? `Despachado · guía ${o.tracking_number}` : 'Despachado')
        if (data?.shippingError) toast(`Guía pendiente: ${data.shippingError}`, { icon: '⚠️' })
        return
      }
      // Si la migración SQL aún no corrió, redirigimos el campo nuevo al
      // legacy para evitar fallar el update.
      const courierColumn = await courierPendingColumn()
      const remapped: Record<string, unknown> = { ...changes }
      if ('payment_courier_pending' in remapped && courierColumn === 'payment_cash_bogo') {
        remapped.payment_cash_bogo = remapped.payment_courier_pending
        delete remapped.payment_courier_pending
      }
      const { error } = await supabase.from('orders').update(remapped).eq('id', id)
      if (error) throw error
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...changes } : o)))
      toast.success('Actualizado')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar'
      toast.error(msg)
    }
  }

  const kpis = computeKPIs(orders, owner)
  const vendorOptions = buildVendorOptions(orders, owner)

  const dayName = getDayOfWeek(new Date(date + 'T00:00:00'))
  const displayDate = formatDisplayDate(date)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/orders')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Volver a Pedidos"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">
              {dayName}, {displayDate}
            </h1>
          </div>
          <p className="mt-0.5 pl-9 text-sm text-gray-500">
            {orders.length} pedido{orders.length !== 1 ? 's' : ''} este día
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Prev / Next day navigation */}
          <button
            onClick={() => router.push(`/orders/daily/${offsetDate(date, -1)}`)}
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 shadow-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Día anterior"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push(`/orders/daily/${offsetDate(date, 1)}`)}
            className="rounded-xl border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50 shadow-sm transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="Día siguiente"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <button
            onClick={() => router.push(`/orders/new?date=${date}`)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
          >
            <Plus className="h-4 w-4" />
            Nuevo Pedido
          </button>
        </div>
      </div>

      {!supabaseOk && <SupabaseBanner />}

      {/* KPI Panel */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KPIItem label="Total Pedidos" value={kpis.totalOrders} />
        <div className="space-y-1">
          <span className="text-xs text-gray-500">Entregas</span>
          <div className="flex items-baseline gap-1 font-bold text-gray-900">
            <span className="text-base">
              {kpis.deliveredCourier + kpis.deliveredPickup + kpis.deliveredOther}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-500">
            <span>Mensajería: {kpis.deliveredCourier}</span>
            <span>Recogida: {kpis.deliveredPickup}</span>
            <span>Otro: {kpis.deliveredOther}</span>
          </div>
        </div>
        <KPIItem label="Devoluciones" value={kpis.returns} />
        <KPIItem label="Cambios" value={kpis.exchanges} />
        <KPIItem label="Cancelados" value={kpis.cancelled} />

        <div className="space-y-1">
          <span className="text-xs text-gray-500">Recaudo</span>
          <div className="font-bold text-gray-900">{formatCurrency(kpis.totalRevenue)}</div>
          <div className="flex flex-col gap-0.5 text-[10px] text-gray-500">
            <span title="Pendiente de liquidación por el mensajero">Mensajero: {formatCurrency(kpis.revenueCourierPending)}</span>
            <span>Caja: {formatCurrency(kpis.revenueCash)}</span>
            <span>Transferencia: {formatCurrency(kpis.revenueTransfer)}</span>
          </div>
        </div>

        <KPIItem label={vendorDisplayName(owner, 'Vendedor') || 'Vendedor'} value={kpis.ordersOwner} />

        <KPIItem label="Costos" value={formatCurrency(kpis.totalCosts)} />
        <KPIItem label="Gastos Op." value={formatCurrency(kpis.totalOperatingCosts)} />
        <KPIItem
          label="Utilidad"
          value={formatCurrency(kpis.profit)}
        />
      </div>

      {/* Orders table / cards */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2"
            style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }}
          />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <ShoppingBag className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No hay pedidos para este día</p>
          <button
            onClick={() => router.push(`/orders/new?date=${date}`)}
            className="text-sm font-medium text-purple-600 hover:text-purple-700"
          >
            Agregar el primero
          </button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">ID</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Cliente</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Dirección</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Detalle</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Valor</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Estado</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Tipo</th>
                  <th className="px-4 py-3.5 text-xs font-semibold text-gray-500">Vendedora</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <OrderTableRow key={order.id} order={order} onUpdate={handleUpdateOrder} vendorOptions={vendorOptions} onReceipt={setReceiptOrder} phasesEnabled={phasesEnabled} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {orders.map((order) => (
              <OrderMobileCard key={order.id} order={order} onUpdate={handleUpdateOrder} vendorOptions={vendorOptions} onReceipt={setReceiptOrder} phasesEnabled={phasesEnabled} />
            ))}
          </div>
        </>
      )}

      {receiptOrder && (
        <OrderReceipt order={receiptOrder} onClose={() => setReceiptOrder(null)} />
      )}
    </div>
  )
}
