'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Printer,
  MapPin,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  X,
  Truck,
  Navigation,
  Package,
  DollarSign,
  HelpCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { useUser } from '@/lib/UserContext'
import { useTenant } from '@/lib/TenantContext'
import { isOwnerSupported } from '@/lib/db'
import { GuideCard } from '@/components/dispatch/DispatchGuide'
import WhatsAppLink from '@/components/shared/WhatsAppLink'
import PageHelpModal from '@/components/shared/PageHelpModal'
import { DISPATCH_HELP } from '@/lib/pageHelp'
import { resolvePrintSizes, type PrintSizes } from '@/lib/preferences'

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split('-')
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  return `${parseInt(d)} de ${months[parseInt(m) - 1]} de ${y}`
}

// ─── PrintView (Guías) ───────────────────────────────────────────────────────

function PrintView({ orders, onClose, sizes }: { orders: Order[]; onClose: () => void; sizes: PrintSizes }) {
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 flex items-center justify-between gap-3 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <span className="font-semibold text-gray-700">
          Vista de impresión — {orders.length} guías
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: '#7c3aed' }}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 p-2 hover:bg-gray-50"
            aria-label="Cerrar vista de impresión"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Cards grid — 2 per row, page break every 4 cards */}
      <div className="print-area p-4 print:p-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 guide-grid">
          {orders.map((order, idx) => {
            const isLastInPage = (idx + 1) % 4 === 0 && idx !== orders.length - 1
            return (
              <div key={order.id} className={isLastInPage ? 'guide-page-break' : ''}>
                <GuideCard
                  sizes={sizes}
                  order={{
                    order_code: order.order_code,
                    client_name: order.client_name,
                    phone: order.phone,
                    address: order.address,
                    complement: order.complement || '',
                    product_ref: order.product_ref || '',
                    detail: order.detail || '',
                    value_to_collect: order.value_to_collect,
                    comment: order.comment || '',
                    payment_timing: order.payment_timing ?? '',
                    prepaid_amount: order.prepaid_amount ?? 0,
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── RouteView ───────────────────────────────────────────────────────────────

function RouteView({
  orders,
  date,
  onClose,
}: {
  orders: Order[]
  date: string
  onClose: () => void
}) {
  const { config } = useTenant()
  const groups = orders.reduce<Record<string, Order[]>>((acc, order) => {
    const zone = (order.complement?.trim() || 'Sin barrio').split(/[,;]/)[0].trim()
    if (!acc[zone]) acc[zone] = []
    acc[zone].push(order)
    return acc
  }, {})

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.keys(groups).reduce((a, k) => ({ ...a, [k]: true }), {})
  )

  // Sort zones by number of orders descending
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)

  const totalValue = orders.reduce((sum, o) => sum + o.value_to_collect, 0)

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 overflow-y-auto">
      {/* Screen-only top bar */}
      <div className="print:hidden sticky top-0 flex items-center justify-between gap-3 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
        <div>
          <h2 className="font-bold text-gray-900">Ruta sugerida</h2>
          <p className="text-xs text-gray-500">
            {sorted.length} zona{sorted.length !== 1 ? 's' : ''} — {orders.length} pedido
            {orders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: '#7c3aed' }}
          >
            <Printer className="h-4 w-4" />
            Imprimir Ruta
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 p-2 hover:bg-gray-50"
            aria-label="Cerrar ruta sugerida"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* ── Print area ─────────────────────────────────────────────────────── */}
      <div className="print-area print:p-6">
        {/* Print header — hidden on screen */}
        <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
          <h1 className="text-2xl font-black text-center text-gray-900 uppercase tracking-tight">
            {config.name} — Ruta de Envío
          </h1>
          <p className="text-center text-sm text-gray-600 mt-1">
            Fecha: {formatDateDisplay(date)}
          </p>
        </div>

        {/* Route summary */}
        <div className="print:hidden max-w-2xl mx-auto px-4 pt-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex flex-col items-center">
              <MapPin className="h-5 w-5 mb-1" style={{ color: '#7c3aed' }} />
              <span className="text-xl font-black text-gray-900">{sorted.length}</span>
              <span className="text-xs text-gray-500">paradas</span>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex flex-col items-center">
              <Package className="h-5 w-5 mb-1" style={{ color: '#7c3aed' }} />
              <span className="text-xl font-black text-gray-900">{orders.length}</span>
              <span className="text-xs text-gray-500">pedidos</span>
            </div>
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-4 py-3 flex flex-col items-center">
              <DollarSign className="h-5 w-5 mb-1" style={{ color: '#10b981' }} />
              <span className="text-lg font-black" style={{ color: '#10b981' }}>
                {formatCurrency(totalValue)}
              </span>
              <span className="text-xs text-gray-500">a cobrar</span>
            </div>
          </div>
        </div>

        {/* Print summary table header */}
        <div className="hidden print:block mb-4">
          <div className="grid grid-cols-3 gap-4 text-sm text-gray-700 border border-gray-300 rounded p-3 bg-gray-50">
            <span>
              <strong>Paradas:</strong> {sorted.length}
            </span>
            <span>
              <strong>Pedidos:</strong> {orders.length}
            </span>
            <span>
              <strong>Total a cobrar:</strong> {formatCurrency(totalValue)}
            </span>
          </div>
        </div>

        {/* Print table */}
        <div className="hidden print:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-400 px-2 py-1 text-left">#</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Barrio / Zona</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Cliente</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Dirección</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Teléfono</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Producto</th>
                <th className="border border-gray-400 px-2 py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {sorted.flatMap(([zone, zoneOrders], stopIdx) =>
                zoneOrders.map((order, oIdx) => (
                  <tr
                    key={order.id}
                    className={stopIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="border border-gray-300 px-2 py-1 font-bold text-center">
                      {oIdx === 0 ? stopIdx + 1 : ''}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 font-semibold">
                      {oIdx === 0 ? zone : ''}
                    </td>
                    <td className="border border-gray-300 px-2 py-1">{order.client_name}</td>
                    <td className="border border-gray-300 px-2 py-1">{order.address}</td>
                    <td className="border border-gray-300 px-2 py-1"><WhatsAppLink phone={order.phone} className="text-green-600 hover:underline" /></td>
                    <td className="border border-gray-300 px-2 py-1">{order.product_ref}</td>
                    <td className="border border-gray-300 px-2 py-1 text-right font-semibold">
                      {formatCurrency(order.value_to_collect)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={6} className="border border-gray-400 px-2 py-1 text-right">
                  Total
                </td>
                <td className="border border-gray-400 px-2 py-1 text-right">
                  {formatCurrency(totalValue)}
                </td>
              </tr>
            </tfoot>
          </table>
          {/* Print footer */}
          <div className="mt-6 pt-4 border-t border-gray-400 flex justify-between text-xs text-gray-500">
            <span>{config.phone ? `${config.name} — ${config.phone}` : config.name}</span>
            <span>
              Total pedidos: {orders.length} | Total valor: {formatCurrency(totalValue)}
            </span>
          </div>
        </div>

        {/* ── Interactive stops (screen only) ────────────────────────────── */}
        <div className="print:hidden max-w-2xl mx-auto px-4 pb-6 space-y-3">
          {sorted.map(([zone, zoneOrders], idx) => {
            const zoneTotal = zoneOrders.reduce((s, o) => s + o.value_to_collect, 0)
            return (
              <div
                key={zone}
                className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setExpanded((prev) => ({ ...prev, [zone]: !prev[zone] }))}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-black"
                      style={{ background: '#7c3aed' }}
                    >
                      {idx + 1}
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-purple-500" />
                        <span>Parada {idx + 1} — {zone}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {zoneOrders.length} pedido{zoneOrders.length !== 1 ? 's' : ''} ·{' '}
                        <span style={{ color: '#10b981' }} className="font-semibold">
                          {formatCurrency(zoneTotal)}
                        </span>
                      </p>
                    </div>
                  </div>
                  {expanded[zone] ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </button>

                {expanded[zone] && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {zoneOrders.map((order) => (
                      <div key={order.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">
                              {order.client_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{order.address}</p>
                            <p className="text-xs text-gray-400">
                              <WhatsAppLink phone={order.phone} className="text-green-600 hover:underline" /> · {order.product_ref}
                            </p>
                          </div>
                          <span
                            className="shrink-0 font-bold text-sm"
                            style={{ color: '#7c3aed' }}
                          >
                            {formatCurrency(order.value_to_collect)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

type ViewMode = 'guias' | 'ruta'

export default function DispatchPage() {
  const owner = useUser()
  const [date, setDate] = useState(todayISO())
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [activeView, setActiveView] = useState<ViewMode | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [printSizes, setPrintSizesState] = useState<PrintSizes>({ header: 11, body: 12, bold: 13, footer: 9 })

  useEffect(() => { setPrintSizesState(resolvePrintSizes(owner)) }, [owner, activeView])

  const loadOrders = useCallback(async (d: string) => {
    setLoading(true)
    setSelected(new Set())
    try {
      const hasOwner = await isOwnerSupported()
      let query = supabase.from('orders').select('*')
      if (hasOwner) query = query.eq('owner', owner)
      query = query.eq('order_date', d).eq('delivery_status', 'Confirmado').order('id', { ascending: true })
      const { data, error } = await query
      if (error) throw error
      setOrders(data ?? [])
    } catch (err) {
      console.error(err)
      toast.error('Error al cargar los pedidos')
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    loadOrders(date)
  }, [date, loadOrders])

  const allSelected = orders.length > 0 && selected.size === orders.length

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orders.map((o) => o.id)))
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedOrders = orders.filter((o) => selected.has(o.id))
  const totalValue = selectedOrders.reduce((sum, o) => sum + o.value_to_collect, 0)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Despacho</h1>
              <p className="text-xs text-gray-500">Pedidos confirmados para despachar</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHelpOpen(true)}
                className="flex items-center justify-center rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 transition-colors"
                title="¿Qué hace esta pantalla?"
                aria-label="Ayuda de Despacho"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              <Truck className="h-4 w-4 text-gray-400" />
              <input
                type="date"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {helpOpen && <PageHelpModal content={DISPATCH_HELP} onClose={() => setHelpOpen(false)} />}

      <div className="mx-auto max-w-3xl px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2"
              style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }}
            />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Truck className="h-10 w-10 mb-2" />
            <p className="text-sm">No hay pedidos confirmados para esta fecha</p>
          </div>
        ) : (
          <>
            {/* Select all */}
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm border border-gray-100">
              <button
                onClick={toggleAll}
                className="flex items-center gap-2 text-sm font-medium text-gray-700"
              >
                {allSelected ? (
                  <CheckSquare className="h-5 w-5" style={{ color: '#7c3aed' }} />
                ) : (
                  <Square className="h-5 w-5 text-gray-400" />
                )}
                Seleccionar todos ({orders.length})
              </button>
            </div>

            {/* Order cards */}
            {orders.map((order) => {
              const isSelected = selected.has(order.id)
              return (
                <button
                  key={order.id}
                  onClick={() => toggleOne(order.id)}
                  className={cn(
                    'w-full text-left rounded-2xl border-2 bg-white p-4 shadow-sm transition-all',
                    isSelected
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-gray-100 hover:border-gray-300'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5" style={{ color: '#7c3aed' }} />
                      ) : (
                        <Square className="h-5 w-5 text-gray-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-bold text-gray-900">{order.client_name}</p>
                        <span className="font-black text-lg" style={{ color: '#7c3aed' }}>
                          {formatCurrency(order.value_to_collect)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5">{order.address}</p>
                      {order.complement && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {order.complement}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400">
                        <span>#{order.order_code}</span>
                        <WhatsAppLink phone={order.phone} className="text-green-600 hover:underline" />
                        {order.product_ref && <span>{order.product_ref}</span>}
                        {order.detail && <span className="text-gray-500">{order.detail}</span>}
                      </div>
                      {order.comment && (
                        <p className="mt-1 text-xs text-amber-600 italic">{order.comment}</p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </>
        )}
      </div>

      {/* Bottom action bar — toggle between Guías / Ruta */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bg-white border-t border-gray-200 shadow-lg px-4 py-3 z-40 md:bottom-0" style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm text-gray-600">
                <span className="font-bold text-gray-900">{selected.size}</span> pedido
                {selected.size !== 1 ? 's' : ''} seleccionado
                {selected.size !== 1 ? 's' : ''}
              </div>
              <div className="text-sm font-bold" style={{ color: '#10b981' }}>
                {formatCurrency(totalValue)}
              </div>
            </div>

            {/* Toggle tabs */}
            <div className="flex rounded-xl overflow-hidden border border-purple-300">
              <button
                onClick={() => setActiveView('ruta')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors',
                  activeView === 'ruta'
                    ? 'text-white'
                    : 'text-purple-700 hover:bg-purple-50'
                )}
                style={activeView === 'ruta' ? { background: '#7c3aed' } : {}}
              >
                <Navigation className="h-4 w-4" />
                Ruta
              </button>
              <button
                onClick={() => setActiveView('guias')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors border-l border-purple-300',
                  activeView === 'guias'
                    ? 'text-white'
                    : 'text-purple-700 hover:bg-purple-50'
                )}
                style={activeView === 'guias' ? { background: '#7c3aed' } : {}}
              >
                <Printer className="h-4 w-4" />
                Guías
              </button>
            </div>
          </div>
        </div>
      )}

      {activeView === 'guias' && (
        <PrintView orders={selectedOrders} onClose={() => setActiveView(null)} sizes={printSizes} />
      )}
      {activeView === 'ruta' && (
        <RouteView orders={selectedOrders} date={date} onClose={() => setActiveView(null)} />
      )}
    </div>
  )
}
