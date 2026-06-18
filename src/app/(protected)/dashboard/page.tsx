'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShoppingBag,
  Banknote,
  TrendingUp,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Download,
  PercentCircle,
  Star,
  HelpCircle,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { Order } from '@/lib/types'
import { getCourierPending } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { downloadExcel } from '@/lib/export'
import { useUser } from '@/lib/UserContext'
import { useTenant } from '@/lib/TenantContext'
import { isOwnerSupported } from '@/lib/db'
import AlertsBanner from '@/components/shared/AlertsBanner'
import PageHelpModal from '@/components/shared/PageHelpModal'
import { DASHBOARD_HELP } from '@/lib/pageHelp'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const STATUS_STYLES: Record<Order['delivery_status'], { label: string; cls: string }> = {
  Confirmado: { label: 'Confirmado', cls: 'bg-blue-100 text-blue-700' },
  Enviado:    { label: 'Enviado',    cls: 'bg-purple-100 text-purple-700' },
  Entregado:  { label: 'Entregado',  cls: 'bg-amber-100 text-amber-700' },
  Pagado:     { label: 'Pagado',     cls: 'bg-emerald-100 text-emerald-700' },
  Devolucion: { label: 'Devolución', cls: 'bg-orange-100 text-orange-700' },
  Cancelado:  { label: 'Cancelado',  cls: 'bg-red-100 text-red-700' },
}

interface KPICardProps {
  label: string
  value: string
  icon: React.ReactNode
  color: string
  sub?: React.ReactNode
  highlight?: boolean
}

function KPICard({ label, value, icon, color, sub, highlight }: KPICardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl p-4 shadow-sm border',
        highlight
          ? 'border-purple-200 bg-purple-50'
          : 'border-gray-100 bg-white'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-gray-500">{label}</p>
          <p
            className={cn('text-2xl font-black mt-0.5', highlight && 'text-3xl')}
            style={{ color: highlight ? '#7c3aed' : color }}
          >
            {value}
          </p>
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: color }}
        >
          {icon}
        </div>
      </div>
      {sub && <div className="mt-2">{sub}</div>}
    </div>
  )
}

interface SubBreakdownProps {
  items: { label: string; value: string; color: string }[]
}

function SubBreakdown({ items }: SubBreakdownProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <span key={item.label} className="text-xs text-gray-500">
          {item.label}: <strong style={{ color: item.color }}>{item.value}</strong>
        </span>
      ))}
    </div>
  )
}

function VendorCard({ name, count, color }: { name: string; count: number; color: string }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white font-bold"
        style={{ background: color }}
      >
        <User className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{name}</p>
        <p className="text-xl font-bold text-gray-900">{count} <span className="text-sm font-normal text-gray-500">pedidos</span></p>
      </div>
    </div>
  )
}

interface ChartDatum {
  day: string
  revenue: number
}

export default function DashboardPage() {
  const owner = useUser()
  const { config } = useTenant()
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  const loadOrders = useCallback(async (y: number, m: number) => {
    setLoading(true)
    try {
      const from = `${y}-${String(m).padStart(2, '0')}-01`
      const daysInMonth = new Date(y, m, 0).getDate()
      const to = `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      const hasOwner = await isOwnerSupported()
      let query = supabase.from('orders').select('*')
      if (hasOwner) query = query.eq('owner', owner)
      query = query.gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false })
      const { data, error } = await query
      if (error) throw error
      setOrders(data ?? [])
    } catch (err) {
      console.error(err)
      toast.error('Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    loadOrders(year, month)
  }, [year, month, loadOrders])

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  // KPI calculations — pipeline: Confirmado → Enviado → Entregado → Pagado
  const confirmed = orders.filter((o) => o.delivery_status === 'Confirmado')
  const sent      = orders.filter((o) => o.delivery_status === 'Enviado')
  const delivered = orders.filter((o) => o.delivery_status === 'Entregado')
  const paid      = orders.filter((o) => o.delivery_status === 'Pagado')
  const returns   = orders.filter((o) => o.delivery_status === 'Devolucion')
  const cancelled = orders.filter((o) => o.delivery_status === 'Cancelado')
  // Active = not cancelled/returned (count towards revenue)
  const activeOrders = orders.filter((o) =>
    ['Confirmado', 'Enviado', 'Entregado', 'Pagado'].includes(o.delivery_status)
  )
  // Pendiente de liquidación = pedidos Entregados pero aún no Pagados,
  // típicamente plata que el mensajero ya cobró pero no nos consignó.
  const pendingSettlement = delivered.reduce((s, o) => s + o.value_to_collect, 0)

  // Revenue: active orders, NOT cancelled/returned
  const totalRevenue = activeOrders.reduce((s, o) => s + o.value_to_collect, 0)
  const pendingRevenue  = [...confirmed, ...sent].reduce((s, o) => s + o.value_to_collect, 0)
  const paidRevenue     = paid.reduce((s, o) => s + o.value_to_collect, 0)

  const totalCosts    = activeOrders.reduce((s, o) => s + o.product_cost, 0)
  const totalOpCosts  = activeOrders.reduce((s, o) => s + o.operating_cost, 0)
  const totalExpenses = totalCosts + totalOpCosts

  const profit = totalRevenue - totalExpenses

  // Vendor breakdown — agrupamos por el campo `vendor` del pedido; los pedidos
  // sin vendedora se atribuyen al usuario actual.
  const vendorCounts = orders.reduce<Record<string, number>>((acc, o) => {
    const name = o.vendor?.trim() || owner
    acc[name] = (acc[name] ?? 0) + 1
    return acc
  }, {})
  const vendorBreakdown = Object.entries(vendorCounts)
    .sort((a, b) => b[1] - a[1])
  const VENDOR_COLORS = ['#7c3aed', '#8b5cf6', '#a78bfa', '#0ea5e9', '#10b981']

  const totalOrders = orders.length
  const avgPerOrder = activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0
  const returnRate = totalOrders > 0 ? ((returns.length / totalOrders) * 100).toFixed(1) : '0.0'
  const cancelRate = totalOrders > 0 ? ((cancelled.length / totalOrders) * 100).toFixed(1) : '0.0'

  // Top 5 products by product_ref (active orders)
  const productMap = activeOrders.reduce<Record<string, { count: number; total: number }>>((acc, o) => {
    const ref = o.product_ref?.trim()
    if (!ref) return acc
    if (!acc[ref]) acc[ref] = { count: 0, total: 0 }
    acc[ref].count += 1
    acc[ref].total += o.value_to_collect ?? 0
    return acc
  }, {})
  const top5Products = Object.entries(productMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  // Payment breakdown for pie chart (only delivered — payments registered at delivery)
  const deliveredCourierPending = delivered.reduce((s, o) => s + getCourierPending(o), 0)
  const deliveredCash     = delivered.reduce((s, o) => s + o.payment_cash, 0)
  const deliveredTransfer = delivered.reduce((s, o) => s + o.payment_transfer, 0)
  const paymentPieData = [
    { name: 'Mensajero (pendiente)', value: deliveredCourierPending },
    { name: 'Caja', value: deliveredCash },
    { name: 'Transferencia', value: deliveredTransfer },
  ].filter((d) => d.value > 0)
  const PIE_COLORS = ['#7c3aed', '#10b981', '#0ea5e9']

  // Chart data: revenue per day (active orders)
  const daysInMonth = new Date(year, month, 0).getDate()
  const chartData: ChartDatum[] = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${day}`
    const dayRevenue = activeOrders
      .filter((o) => o.order_date === dateStr)
      .reduce((s, o) => s + o.value_to_collect, 0)
    return { day: String(i + 1), revenue: dayRevenue }
  })

  // Recent orders
  const recentOrders = orders.slice(0, 10)

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-5xl flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          {/* Title + month on mobile (stacked) */}
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">Dashboard</h1>
              <p className="text-[11px] sm:text-xs text-gray-500">{config.name}</p>
            </div>
            {/* Month selector — aligned right inside the title row */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={prevMonth}
                className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 transition-colors"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>
              <span className="min-w-[96px] sm:min-w-[140px] text-center text-xs sm:text-sm font-semibold text-gray-900">
                {MONTH_NAMES[month - 1]} {year}
              </span>
              <button
                onClick={nextMonth}
                className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 transition-colors"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
          {/* Export + help (own row on mobile, inline on desktop) */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelpOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors"
              title="¿Qué hace esta pantalla?"
              aria-label="Ayuda de Inicio"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Ayuda</span>
            </button>
            <button
              onClick={async () => {
                try {
                  await downloadExcel('dashboard', {
                    month: String(month),
                    year: String(year),
                    owner,
                  })
                } catch {
                  toast.error('Error al exportar')
                }
              }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Exportar</span>
            </button>
          </div>
        </div>
      </div>
      {helpOpen && <PageHelpModal content={DASHBOARD_HELP} onClose={() => setHelpOpen(false)} />}

      <div className="mx-auto max-w-5xl px-4 py-4 space-y-6">
        <AlertsBanner />
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2"
              style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label="Total Pedidos"
                value={String(orders.length)}
                icon={<ShoppingBag className="h-5 w-5" />}
                color="#3b82f6"
                sub={
                  <SubBreakdown items={[
                    { label: 'Entregados', value: String(delivered.length), color: '#10b981' },
                    { label: 'Devoluciones', value: String(returns.length), color: '#f59e0b' },
                    { label: 'Cancelados', value: String(cancelled.length), color: '#ef4444' },
                  ]} />
                }
              />
              <KPICard
                label="Valor Total Pedidos"
                value={formatCurrency(totalRevenue)}
                icon={<Banknote className="h-5 w-5" />}
                color="#0ea5e9"
                sub={
                  <SubBreakdown items={[
                    { label: 'Pagado', value: formatCurrency(paidRevenue), color: '#10b981' },
                    { label: 'Pdte. liquidación', value: formatCurrency(pendingSettlement), color: '#f59e0b' },
                    { label: 'En ruta', value: formatCurrency(pendingRevenue), color: '#3b82f6' },
                  ]} />
                }
              />
              <KPICard
                label="Costos + Gastos Op."
                value={formatCurrency(totalExpenses)}
                icon={<AlertCircle className="h-5 w-5" />}
                color="#f59e0b"
                sub={
                  <SubBreakdown items={[
                    { label: 'Costos', value: formatCurrency(totalCosts), color: '#f59e0b' },
                    { label: 'Op.', value: formatCurrency(totalOpCosts), color: '#ef4444' },
                  ]} />
                }
              />
              <KPICard
                label="Utilidad esperada"
                value={formatCurrency(profit)}
                icon={<TrendingUp className="h-5 w-5" />}
                color={profit >= 0 ? '#10b981' : '#ef4444'}
                highlight
              />
            </div>

            {/* Pipeline + Bogo debt */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-blue-50 border border-blue-100 p-3">
                <p className="text-[10px] font-semibold text-blue-500 uppercase">Confirmados</p>
                <p className="text-xl font-bold text-blue-700 mt-0.5">{confirmed.length}</p>
                <p className="text-[10px] text-blue-500 truncate">{formatCurrency(confirmed.reduce((s,o)=>s+o.value_to_collect,0))}</p>
              </div>
              <div className="rounded-2xl bg-purple-50 border border-purple-100 p-3">
                <p className="text-[10px] font-semibold text-purple-500 uppercase">Enviados</p>
                <p className="text-xl font-bold text-purple-700 mt-0.5">{sent.length}</p>
                <p className="text-[10px] text-purple-500 truncate">{formatCurrency(sent.reduce((s,o)=>s+o.value_to_collect,0))}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 border-2 border-amber-200 p-3">
                <p className="text-[10px] font-semibold text-amber-600 uppercase">🚚 Pendiente de liquidación</p>
                <p className="text-xl font-bold text-amber-700 mt-0.5">{formatCurrency(pendingSettlement)}</p>
                <p className="text-[10px] text-amber-600">{delivered.length} pedido(s) entregados</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                <p className="text-[10px] font-semibold text-emerald-500 uppercase">✓ Pagados</p>
                <p className="text-xl font-bold text-emerald-700 mt-0.5">{paid.length}</p>
                <p className="text-[10px] text-emerald-500 truncate">{formatCurrency(paidRevenue)}</p>
              </div>
            </div>

            {/* Extra KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <KPICard
                label="Promedio por Pedido"
                value={formatCurrency(avgPerOrder)}
                icon={<Banknote className="h-5 w-5" />}
                color="#8b5cf6"
              />
              <KPICard
                label="Tasa Devolución"
                value={`${returnRate}%`}
                icon={<PercentCircle className="h-5 w-5" />}
                color="#f59e0b"
              />
              <KPICard
                label="Tasa Cancelación"
                value={`${cancelRate}%`}
                icon={<PercentCircle className="h-5 w-5" />}
                color="#ef4444"
              />
            </div>

            {/* Vendor card */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wide">Vendedora</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {vendorBreakdown.length > 0 ? (
                  vendorBreakdown.map(([name, count], idx) => (
                    <VendorCard
                      key={name}
                      name={name}
                      count={count}
                      color={VENDOR_COLORS[idx % VENDOR_COLORS.length]}
                    />
                  ))
                ) : (
                  <VendorCard name={owner} count={0} color="#7c3aed" />
                )}
              </div>
            </div>

            {/* Daily revenue chart */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-4 truncate">Recaudo por día</h2>
              {chartData.some((d) => d.revenue > 0) ? (
                <div className="overflow-x-auto">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                      width={45}
                    />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Recaudo']}
                      labelFormatter={(label) => `Día ${label}`}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #e5e7eb',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-gray-400">
                  Sin datos de recaudo para este mes
                </div>
              )}
            </div>

            {/* Top 5 Productos + Payment pie */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Top 5 */}
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  Top 5 Productos
                </h2>
                {top5Products.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                    Sin datos de pedidos activos
                  </div>
                ) : (
                  <div className="space-y-2">
                    {top5Products.map(([ref, stats], idx) => (
                      <div key={ref} className="flex items-center gap-3">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: idx === 0 ? '#7c3aed' : idx === 1 ? '#8b5cf6' : '#a78bfa' }}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{ref}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-xs font-bold text-gray-900">{stats.count} ped.</span>
                          <span className="ml-2 text-xs text-gray-500">{formatCurrency(stats.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment breakdown pie */}
              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Recaudo por Método de Pago</h2>
                {paymentPieData.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                    Sin datos de recaudo
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={paymentPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {paymentPieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Recaudo']} />
                      <Legend
                        formatter={(value) => (
                          <span className="text-xs text-gray-600">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Recent orders */}
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Últimos pedidos</h2>
              </div>
              {recentOrders.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-sm text-gray-400">
                  No hay pedidos este mes
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentOrders.map((order) => {
                    const s = STATUS_STYLES[order.delivery_status]
                    return (
                      <button
                        key={order.id}
                        onClick={() => router.push(`/orders/daily/${order.order_date}`)}
                        className="flex items-center justify-between gap-3 px-4 py-3 w-full text-left hover:bg-gray-50 transition-colors active:bg-gray-100"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm truncate">{order.client_name}</p>
                          <p className="text-xs text-gray-400 truncate">
                            #{order.order_code} · {order.order_date} · {order.vendor}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-semibold text-sm text-gray-900">
                            {formatCurrency(order.value_to_collect)}
                          </span>
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', s.cls)}>
                            {s.label}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
