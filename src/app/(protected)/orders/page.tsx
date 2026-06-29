'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  ShoppingBag,
  PackageCheck,
  Undo2,
  XCircle,
  Banknote,
  TrendingUp,
  X,
  HelpCircle,
  CalendarDays,
  List,
  Search as SearchIcon,
  Filter as FilterIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/lib/types'
import { cn, formatCurrency, getMonthDays } from '@/lib/utils'
import { useUser } from '@/lib/UserContext'
import { isOwnerSupported } from '@/lib/db'
import PageHelpModal from '@/components/shared/PageHelpModal'
import { ORDERS_HELP } from '@/lib/pageHelp'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAY_NAMES_MOBILE = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function SupabaseBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>
        Supabase no está configurado: no se pueden cargar datos. Configura las variables de
        entorno para ver los pedidos reales.
      </span>
    </div>
  )
}

interface KPICardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  onClick?: () => void
}

function KPICard({ label, value, icon, color, onClick }: KPICardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm border border-gray-100 text-left transition-all active:scale-[0.97] hover:shadow-md w-full"
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="truncate font-bold text-gray-900">{value}</p>
      </div>
    </button>
  )
}

function padDate(n: number) {
  return String(n).padStart(2, '0')
}

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const owner = useUser()
  const sp = use(searchParams)
  const router = useRouter()

  const now = new Date()
  const [year, setYear] = useState<number>(() => {
    const y = parseInt(String(sp.year ?? ''))
    return isNaN(y) ? now.getFullYear() : y
  })
  const [month, setMonth] = useState<number>(() => {
    const m = parseInt(String(sp.month ?? ''))
    return isNaN(m) || m < 1 || m > 12 ? now.getMonth() + 1 : m
  })

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [supabaseOk, setSupabaseOk] = useState(true)
  const [kpiFilter, setKpiFilter] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  // Vista Calendario / Lista (se recuerda en localStorage)
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar')
  useEffect(() => {
    const stored = typeof window !== 'undefined'
      ? (window.localStorage.getItem('koptup.orders.viewMode') ?? window.localStorage.getItem('meraki.orders.viewMode'))
      : null
    if (stored === 'list' || stored === 'calendar') setViewMode(stored)
  }, [])
  function changeViewMode(v: 'calendar' | 'list') {
    setViewMode(v)
    try { window.localStorage.setItem('koptup.orders.viewMode', v) } catch { /* ignore */ }
  }

  // Filtros de la vista lista (KPIs se recalculan en vivo con estos)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterVendor, setFilterVendor] = useState<string>('')
  const [filterDeliveryType, setFilterDeliveryType] = useState<string>('')
  const [filterCity, setFilterCity] = useState<string>('')
  const [filterProduct, setFilterProduct] = useState<string>('')
  const [filterSize, setFilterSize] = useState<string>('')
  const [filterColor, setFilterColor] = useState<string>('')
  const [filterPaymentTiming, setFilterPaymentTiming] = useState<string>('')

  function clearAllFilters() {
    setSearchText('')
    setFilterStatus('')
    setFilterVendor('')
    setFilterDeliveryType('')
    setFilterCity('')
    setFilterProduct('')
    setFilterSize('')
    setFilterColor('')
    setFilterPaymentTiming('')
  }

  const todayStr = `${now.getFullYear()}-${padDate(now.getMonth() + 1)}-${padDate(now.getDate())}`

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const from = `${year}-${padDate(month)}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const to = `${year}-${padDate(month)}-${padDate(lastDay)}`

      const hasOwner = await isOwnerSupported()
      let query = supabase.from('orders').select('*')
      if (hasOwner) query = query.eq('owner', owner)
      query = query.gte('order_date', from).lte('order_date', to)
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
  }, [year, month, owner])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Bloquea el scroll del fondo mientras haya algún modal/overlay abierto.
  const anyModalOpen = !!kpiFilter || helpOpen
  useEffect(() => {
    if (anyModalOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [anyModalOpen])

  function prevMonth() {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  // Group orders by date
  const ordersByDate = orders.reduce<Record<string, Order[]>>((acc, o) => {
    const key = o.order_date.slice(0, 10)
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  // Extrae el valor estructurado "Etiqueta: valor" del campo detail.
  function pickDetailField(detail: string | null | undefined, label: string): string {
    if (!detail) return ''
    const re = new RegExp(`${label}:\\s*([^·]+)`, 'i')
    const m = detail.match(re)
    return m ? m[1].trim() : ''
  }

  // Opciones únicas para los selects del modo lista
  const uniqueVendors = Array.from(new Set(orders.map((o) => o.vendor).filter(Boolean))).sort()
  const uniqueCities = Array.from(new Set(orders.map((o) => o.city).filter(Boolean))).sort()
  const uniqueProducts = Array.from(new Set(orders.map((o) => o.product_ref).filter(Boolean))).sort()
  const uniqueSizes = Array.from(new Set(
    orders.map((o) => pickDetailField(o.detail, 'Talla')).filter(Boolean),
  )).sort()
  const uniqueColors = Array.from(new Set(
    orders.map((o) => pickDetailField(o.detail, 'Color')).filter(Boolean),
  )).sort()

  // En modo Lista aplicamos todos los filtros; en Calendario solo el del mes.
  const hasActiveFilters = Boolean(
    searchText || filterStatus || filterVendor || filterDeliveryType
    || filterCity || filterProduct || filterSize || filterColor || filterPaymentTiming,
  )

  const filteredOrders = viewMode === 'list'
    ? orders.filter((o) => {
        if (filterStatus && o.delivery_status !== filterStatus) return false
        if (filterVendor && o.vendor !== filterVendor) return false
        if (filterDeliveryType && o.delivery_type !== filterDeliveryType) return false
        if (filterCity && o.city !== filterCity) return false
        if (filterProduct && o.product_ref !== filterProduct) return false
        if (filterSize && pickDetailField(o.detail, 'Talla').toLowerCase() !== filterSize.toLowerCase()) return false
        if (filterColor && pickDetailField(o.detail, 'Color').toLowerCase() !== filterColor.toLowerCase()) return false
        if (filterPaymentTiming) {
          const t = o.payment_timing || (o.prepaid_amount > 0 ? 'Mixto' : 'ContraEntrega')
          if (t !== filterPaymentTiming) return false
        }
        if (searchText.trim()) {
          const q = searchText.trim().toLowerCase()
          const haystack = [
            o.order_code,
            o.client_name,
            o.phone,
            o.city,
            o.address,
            o.complement,
            o.product_ref,
            o.detail,
            o.comment,
            o.vendor,
            o.delivery_status,
          ].join(' ').toLowerCase()
          if (!haystack.includes(q)) return false
        }
        return true
      })
    : orders

  // KPI summary — usa filteredOrders para que reaccione a los filtros del listado.
  // Un pedido cuenta como "recaudado" (recaudo/utilidad/entregados) si está
  // Entregado O Pagado. Predicado único para que las tarjetas, el detalle del KPI
  // y los cálculos no se desincronicen (antes el detalle solo miraba 'Entregado').
  const isCollected = (o: Order) => o.delivery_status === 'Entregado' || o.delivery_status === 'Pagado'
  const kpiSource = filteredOrders
  const totalOrders = kpiSource.length
  const delivered = kpiSource.filter(isCollected).length
  const returns = kpiSource.filter((o) => o.delivery_status === 'Devolucion').length
  const cancelled = kpiSource.filter((o) => o.delivery_status === 'Cancelado').length
  const totalRevenue = kpiSource
    .filter(isCollected)
    .reduce((sum, o) => sum + (o.value_to_collect ?? 0), 0)
  const totalCosts = kpiSource.reduce((sum, o) => sum + (o.product_cost ?? 0), 0)
  const profit = totalRevenue - totalCosts

  // Filtered orders for KPI detail modal
  const kpiOrders = kpiFilter
    ? orders.filter((o) => {
        if (kpiFilter === 'total') return true
        if (kpiFilter === 'entregado') return isCollected(o)
        if (kpiFilter === 'devolucion') return o.delivery_status === 'Devolucion'
        if (kpiFilter === 'cancelado') return o.delivery_status === 'Cancelado'
        if (kpiFilter === 'recaudo') return isCollected(o)
        if (kpiFilter === 'utilidad') return isCollected(o)
        return false
      })
    : []

  const kpiLabels: Record<string, string> = {
    total: 'Total Pedidos',
    entregado: 'Entregados',
    devolucion: 'Devoluciones',
    cancelado: 'Cancelados',
    recaudo: 'Recaudo',
    utilidad: 'Utilidad',
  }

  // Calendar days
  const days = getMonthDays(year, month)
  // Padding for first day of month
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

  function navigateToDay(dateStr: string) {
    router.push(`/orders/daily/${dateStr}`)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>

        {/* Toggle de vista: Calendario / Lista */}
        <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 sm:order-2">
          <button
            type="button"
            onClick={() => changeViewMode('calendar')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:flex-none',
              viewMode === 'calendar' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
            aria-pressed={viewMode === 'calendar'}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendario
          </button>
          <button
            type="button"
            onClick={() => changeViewMode('list')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all sm:flex-none',
              viewMode === 'list' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
            aria-pressed={viewMode === 'list'}
          >
            <List className="h-3.5 w-3.5" />
            Lista
          </button>
        </div>

        {/* Month selector: fila completa en móvil */}
        <div className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white px-1 py-1 shadow-sm sm:order-2">
          <button
            onClick={prevMonth}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-0 flex-1 text-center text-sm font-semibold text-gray-700 sm:min-w-[140px]">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Acciones: ayuda + nuevo pedido. Fila aparte en móvil, inline en sm+ */}
        <div className="flex items-center gap-2 sm:order-3">
          <button
            onClick={() => setHelpOpen(true)}
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2.5 text-gray-600 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors"
            title="¿Qué hace esta pantalla?"
            aria-label="Ayuda de Pedidos"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <button
            onClick={() => router.push('/orders/new')}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 sm:flex-none"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
          >
            <Plus className="h-4 w-4" />
            Nuevo Pedido
          </button>
        </div>
      </div>

      {helpOpen && <PageHelpModal content={ORDERS_HELP} onClose={() => setHelpOpen(false)} />}

      {!supabaseOk && <SupabaseBanner />}

      {/* KPI Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label="Total Pedidos"
          value={totalOrders}
          icon={<ShoppingBag className="h-5 w-5" />}
          color="#7c3aed"
          onClick={() => setKpiFilter('total')}
        />
        <KPICard
          label="Entregados"
          value={delivered}
          icon={<PackageCheck className="h-5 w-5" />}
          color="#10b981"
          onClick={() => setKpiFilter('entregado')}
        />
        <KPICard
          label="Devoluciones"
          value={returns}
          icon={<Undo2 className="h-5 w-5" />}
          color="#f59e0b"
          onClick={() => setKpiFilter('devolucion')}
        />
        <KPICard
          label="Cancelados"
          value={cancelled}
          icon={<XCircle className="h-5 w-5" />}
          color="#ef4444"
          onClick={() => setKpiFilter('cancelado')}
        />
        <KPICard
          label="Recaudo"
          value={formatCurrency(totalRevenue)}
          icon={<Banknote className="h-5 w-5" />}
          color="#0ea5e9"
          onClick={() => setKpiFilter('recaudo')}
        />
        <KPICard
          label="Utilidad"
          value={formatCurrency(profit)}
          icon={<TrendingUp className="h-5 w-5" />}
          color={profit >= 0 ? '#10b981' : '#ef4444'}
          onClick={() => setKpiFilter('utilidad')}
        />
      </div>

      {/* KPI Detail Modal */}
      {kpiFilter && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end md:items-center justify-center" onClick={() => setKpiFilter(null)}>
          <div
            className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[80dvh] flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900">{kpiLabels[kpiFilter]}</h3>
              <button onClick={() => setKpiFilter(null)} className="p-1.5 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Cerrar">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              {kpiOrders.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  No hay pedidos en esta categoría
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {kpiOrders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => { setKpiFilter(null); router.push(`/orders/daily/${order.order_date}`) }}
                      className="flex items-center justify-between gap-3 px-4 py-3 w-full text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm truncate">{order.client_name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          #{order.order_code} · {order.order_date}
                        </p>
                        {order.detail && <p className="text-xs text-gray-500 truncate mt-0.5">{order.detail}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="font-semibold text-sm text-gray-900">
                          {formatCurrency(order.value_to_collect)}
                        </span>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          order.delivery_status === 'Entregado' && 'bg-emerald-100 text-emerald-700',
                          order.delivery_status === 'Confirmado' && 'bg-blue-100 text-blue-700',
                          order.delivery_status === 'Devolucion' && 'bg-amber-100 text-amber-700',
                          order.delivery_status === 'Cancelado' && 'bg-red-100 text-red-700',
                        )}>
                          {order.delivery_status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {kpiOrders.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 shrink-0 bg-gray-50">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{kpiOrders.length} pedido(s)</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(kpiOrders.reduce((s, o) => s + (o.value_to_collect ?? 0), 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Banner: indicador de filtros activos + KPIs reactivos en modo lista */}
      {viewMode === 'list' && hasActiveFilters && (
        <div className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
          <FilterIcon className="h-4 w-4 text-purple-600" />
          <span className="text-purple-900">
            Viendo <b>{filteredOrders.length}</b> de {orders.length} pedidos.
            Los totales de arriba reflejan tu filtro.
          </span>
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-auto rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-purple-700 border border-purple-200 hover:bg-purple-100"
          >
            Quitar filtros
          </button>
        </div>
      )}

      {/* Vista: Lista */}
      {viewMode === 'list' && !loading && (
        <OrdersList
          orders={filteredOrders}
          allOrders={orders}
          uniqueVendors={uniqueVendors}
          uniqueCities={uniqueCities}
          uniqueProducts={uniqueProducts}
          uniqueSizes={uniqueSizes}
          uniqueColors={uniqueColors}
          searchText={searchText}
          setSearchText={setSearchText}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterVendor={filterVendor}
          setFilterVendor={setFilterVendor}
          filterDeliveryType={filterDeliveryType}
          setFilterDeliveryType={setFilterDeliveryType}
          filterCity={filterCity}
          setFilterCity={setFilterCity}
          filterProduct={filterProduct}
          setFilterProduct={setFilterProduct}
          filterSize={filterSize}
          setFilterSize={setFilterSize}
          filterColor={filterColor}
          setFilterColor={setFilterColor}
          filterPaymentTiming={filterPaymentTiming}
          setFilterPaymentTiming={setFilterPaymentTiming}
          onRowClick={(o) => router.push(`/orders/daily/${o.order_date}`)}
        />
      )}

      {/* Calendar grid */}
      {viewMode === 'calendar' && loading ? (
        <div className="flex h-48 items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2"
            style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }}
          />
        </div>
      ) : viewMode === 'calendar' ? (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAY_NAMES_SHORT.map((d, i) => (
              <div
                key={d}
                className="py-2.5 text-center text-xs font-semibold text-gray-500"
              >
                <span className="md:hidden">{DAY_NAMES_MOBILE[i]}</span>
                <span className="hidden md:inline">{d}</span>
              </div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {/* Empty padding cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`pad-${i}`} className="border-b border-r border-gray-50 min-h-[56px] md:min-h-[80px]" />
            ))}

            {days.map((day) => {
              const dateStr = `${year}-${padDate(month)}-${padDate(day.getDate())}`
              const dayOrders = ordersByDate[dateStr] ?? []
              const dayRevenue = dayOrders
                .filter((o) => o.delivery_status === 'Entregado')
                .reduce((sum, o) => sum + (o.value_to_collect ?? 0), 0)
              const isToday = dateStr === todayStr
              const hasOrders = dayOrders.length > 0
              const colIndex = (firstDayOfWeek + day.getDate() - 1) % 7
              const isLastCol = colIndex === 6

              return (
                <button
                  key={dateStr}
                  onClick={() => navigateToDay(dateStr)}
                  className={cn(
                    'relative flex min-h-[56px] md:min-h-[80px] flex-col items-start gap-1 border-b p-1.5 md:p-2 text-left transition-all hover:z-10 hover:shadow-md',
                    isLastCol ? 'border-r-0' : 'border-r',
                    'border-gray-100',
                    isToday && 'bg-purple-50',
                    !isToday && hasOrders && 'hover:bg-emerald-50',
                    !isToday && !hasOrders && 'hover:bg-gray-50',
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                      isToday ? 'text-white' : 'text-gray-700',
                    )}
                    style={isToday ? { background: '#7c3aed' } : {}}
                  >
                    {day.getDate()}
                  </span>

                  {hasOrders && (
                    <>
                      <span className="text-[10px] md:text-xs font-semibold text-emerald-600">
                        <span className="md:hidden">{dayOrders.length}</span>
                        <span className="hidden md:inline">{dayOrders.length} {dayOrders.length === 1 ? 'pedido' : 'pedidos'}</span>
                      </span>
                      {dayRevenue > 0 && (
                        <span className="hidden md:inline text-[10px] text-gray-500 leading-tight">
                          {formatCurrency(dayRevenue)}
                        </span>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────
 * OrdersList — vista lista con filtros por columna (cliente, ciudad,
 * producto, estado, vendedor, tipo de entrega).
 * ───────────────────────────────────────────────────────────────────── */

const STATUS_OPTIONS: Order['delivery_status'][] = [
  'Confirmado', 'Enviado', 'Entregado', 'Pagado', 'Devolucion', 'Cancelado',
]
// Incluye los valores legacy en el dropdown para que las pantallas filtren
// correctamente pedidos creados antes de la migración v1.012.
const DELIVERY_TYPES: Array<{ value: Exclude<Order['delivery_type'], ''>; label: string }> = [
  { value: 'Mensajeria', label: 'Mensajería' },
  { value: 'Recogida', label: 'Recogida en tienda' },
  { value: 'Otro', label: 'Otro' },
  { value: 'Bogo', label: 'Mensajería (legacy)' },
  { value: 'Bodega', label: 'Recogida (legacy)' },
  { value: 'Otros', label: 'Otro (legacy)' },
]

function statusTone(s: Order['delivery_status']): string {
  if (s === 'Entregado' || s === 'Pagado') return 'bg-emerald-100 text-emerald-700'
  if (s === 'Confirmado') return 'bg-blue-100 text-blue-700'
  if (s === 'Enviado') return 'bg-sky-100 text-sky-700'
  if (s === 'Devolucion') return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

interface OrdersListProps {
  orders: Order[]
  allOrders: Order[]
  uniqueVendors: string[]
  uniqueCities: string[]
  uniqueProducts: string[]
  uniqueSizes: string[]
  uniqueColors: string[]
  searchText: string
  setSearchText: (v: string) => void
  filterStatus: string
  setFilterStatus: (v: string) => void
  filterVendor: string
  setFilterVendor: (v: string) => void
  filterDeliveryType: string
  setFilterDeliveryType: (v: string) => void
  filterCity: string
  setFilterCity: (v: string) => void
  filterProduct: string
  setFilterProduct: (v: string) => void
  filterSize: string
  setFilterSize: (v: string) => void
  filterColor: string
  setFilterColor: (v: string) => void
  filterPaymentTiming: string
  setFilterPaymentTiming: (v: string) => void
  onRowClick: (order: Order) => void
}

function OrdersList({
  orders,
  allOrders,
  uniqueVendors,
  uniqueCities,
  uniqueProducts,
  uniqueSizes,
  uniqueColors,
  searchText,
  setSearchText,
  filterStatus,
  setFilterStatus,
  filterVendor,
  setFilterVendor,
  filterDeliveryType,
  setFilterDeliveryType,
  filterCity,
  setFilterCity,
  filterProduct,
  setFilterProduct,
  filterSize,
  setFilterSize,
  filterColor,
  setFilterColor,
  filterPaymentTiming,
  setFilterPaymentTiming,
  onRowClick,
}: OrdersListProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Barra de búsqueda + filtros */}
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-3">
        <div className="relative mb-2">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar por código, cliente, teléfono, dirección, detalle…"
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Estado (todos)</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Vendedor (todos)</option>
            {uniqueVendors.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select
            value={filterDeliveryType}
            onChange={(e) => setFilterDeliveryType(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Tipo envío</option>
            {DELIVERY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Ciudad (todas)</option>
            {uniqueCities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Producto (todos)</option>
            {uniqueProducts.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={filterPaymentTiming}
            onChange={(e) => setFilterPaymentTiming(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Tipo de pago (todos)</option>
            <option value="ContraEntrega">Contra entrega</option>
            <option value="Anticipado">Pago anticipado</option>
            <option value="Mixto">Mixto (abono)</option>
            <option value="Otro">Otro</option>
          </select>
          {uniqueSizes.length > 0 && (
            <select
              value={filterSize}
              onChange={(e) => setFilterSize(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">Talla (todas)</option>
              {uniqueSizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {uniqueColors.length > 0 && (
            <select
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="">Color (todos)</option>
              {uniqueColors.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Contador de resultados */}
      <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-500 bg-white border-b border-gray-100">
        <span>
          Mostrando <b className="text-gray-700">{orders.length}</b>
          {orders.length !== allOrders.length && (
            <span> de {allOrders.length}</span>
          )} pedido(s)
        </span>
      </div>

      {/* Tabla responsive */}
      {orders.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No hay pedidos que coincidan con los filtros.
        </div>
      ) : (
        <>
          {/* Desktop: tabla tradicional */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2.5 text-left">Fecha</th>
                  <th className="px-3 py-2.5 text-left">Código</th>
                  <th className="px-3 py-2.5 text-left">Cliente</th>
                  <th className="px-3 py-2.5 text-left">Ciudad</th>
                  <th className="px-3 py-2.5 text-left">Producto</th>
                  <th className="px-3 py-2.5 text-left">Estado</th>
                  <th className="px-3 py-2.5 text-right">Recaudo</th>
                  <th className="px-3 py-2.5 text-right">Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o) => {
                  const profit = (o.value_to_collect ?? 0) - (o.product_cost ?? 0)
                  return (
                    <tr
                      key={o.id}
                      onClick={() => onRowClick(o)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{o.order_date}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-700">{o.order_code}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[200px] truncate">{o.client_name}</td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-[140px] truncate">{o.city}</td>
                      <td className="px-3 py-2.5 text-gray-600 font-mono text-xs">{o.product_ref}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', statusTone(o.delivery_status))}>
                          {o.delivery_status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {formatCurrency(o.value_to_collect ?? 0)}
                      </td>
                      <td className={cn(
                        'px-3 py-2.5 text-right font-semibold whitespace-nowrap',
                        profit >= 0 ? 'text-emerald-700' : 'text-red-600',
                      )}>
                        {formatCurrency(profit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: cards apiladas */}
          <ul className="md:hidden divide-y divide-gray-50">
            {orders.map((o) => {
              const profit = (o.value_to_collect ?? 0) - (o.product_cost ?? 0)
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => onRowClick(o)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate">{o.client_name}</p>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusTone(o.delivery_status))}>
                          {o.delivery_status}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 font-mono">{o.order_code} · {o.order_date}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {o.city || '—'} · {o.product_ref || '—'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="text-sm font-bold text-gray-900">
                        {formatCurrency(o.value_to_collect ?? 0)}
                      </span>
                      <span className={cn(
                        'text-[11px] font-semibold',
                        profit >= 0 ? 'text-emerald-700' : 'text-red-600',
                      )}>
                        Util. {formatCurrency(profit)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
