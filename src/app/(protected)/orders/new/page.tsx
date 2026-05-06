'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, ClipboardList, AlertTriangle, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { Product, ParsedOrder, PaymentTiming } from '@/lib/types'
import { PAYMENT_TIMING_OPTIONS } from '@/lib/types'
import { generateOrderCode, vendorDisplayName } from '@/lib/utils'
import AIOrderInput from '@/components/orders/AIOrderInput'
import AIInventoryInput from '@/components/inventory/AIInventoryInput'
import DispatchGuide from '@/components/dispatch/DispatchGuide'
import { useUser } from '@/lib/UserContext'
import { isOwnerSupported, isPaymentTimingSupported, courierPendingColumn } from '@/lib/db'
import { syncInventoryOnOrderSave } from '@/lib/inventorySync'
import { DELIVERY_TYPE_OPTIONS, type DeliveryType } from '@/lib/types'

type DeliveryStatus = 'Confirmado' | 'Entregado' | 'Devolucion' | 'Cancelado'
type Vendor = 'Paola'

interface OrderForm {
  client_name: string
  phone: string
  city: string
  address: string
  neighborhood: string
  locality: string
  sector: string
  complement: string
  product_ref: string
  detail_quantity: string
  detail_size: string
  detail_color: string
  detail_model: string
  detail: string
  comment: string
  value_to_collect: string
  payment_timing: PaymentTiming
  prepaid_amount: string
  payment_courier_pending: string
  payment_cash: string
  payment_transfer: string
  delivery_type: DeliveryType
  vendor: Vendor
  delivery_status: DeliveryStatus
  order_date: string
  is_exchange: boolean
}

const EMPTY_FORM: OrderForm = {
  client_name: '',
  phone: '',
  city: '',
  address: '',
  neighborhood: '',
  locality: '',
  sector: '',
  complement: '',
  product_ref: '',
  detail_quantity: '',
  detail_size: '',
  detail_color: '',
  detail_model: '',
  detail: '',
  comment: '',
  value_to_collect: '',
  payment_timing: 'ContraEntrega',
  prepaid_amount: '',
  payment_courier_pending: '',
  payment_cash: '',
  payment_transfer: '',
  delivery_type: 'Mensajeria',
  vendor: 'Paola',
  delivery_status: 'Confirmado',
  order_date: '',
  is_exchange: false,
}

const DEFAULT_CITY = 'Bogotá'

/**
 * Resuelve cuánto se pagó por anticipado según el tipo de pago elegido:
 * - Anticipado → todo el valor (ignora lo que el usuario tecleó: ya pagó todo).
 * - Mixto → el monto abonado en el campo "Abono anticipado".
 * - Contra entrega / Otro → 0 (se recauda al entregar o se paga diferente).
 */
function normalizePrepaidAmount(form: OrderForm, totalValue: number): number {
  if (form.payment_timing === 'Anticipado') return totalValue
  if (form.payment_timing === 'Mixto') {
    const abono = parseFloat(form.prepaid_amount) || 0
    return Math.max(0, Math.min(abono, totalValue))
  }
  return 0
}

/**
 * Compone las piezas opcionales de ubicación (barrio/localidad/sector)
 * dentro del campo `complement` para que queden visibles en la guía
 * y en la lista, sin necesidad de migrar la BD.
 */
function composeComplement(form: OrderForm): string {
  const parts: string[] = []
  const add = (label: string, value: string) => {
    const v = value.trim()
    if (v) parts.push(`${label}: ${v}`)
  }
  add('Barrio', form.neighborhood)
  add('Localidad', form.locality)
  add('Sector', form.sector)
  const existing = form.complement.trim()
  if (existing) parts.push(existing)
  return parts.join(' · ')
}

/**
 * Compone el detalle estructurado (cantidad, talla, color, modelo) junto
 * con el texto libre. Formato estable con prefijos "Etiqueta: valor"
 * separados por " · " para poder filtrar luego por substring.
 */
function composeDetail(form: OrderForm): string {
  const parts: string[] = []
  const add = (label: string, value: string) => {
    const v = value.trim()
    if (v) parts.push(`${label}: ${v}`)
  }
  add('Cantidad', form.detail_quantity)
  add('Talla', form.detail_size)
  add('Color', form.detail_color)
  add('Modelo', form.detail_model)
  const free = form.detail.trim()
  if (free) parts.push(free)
  return parts.join(' · ')
}

function todayString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function SupabaseBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>
        Supabase no está configurado. El pedido no se podrá guardar hasta que configures las
        variables de entorno.
      </span>
    </div>
  )
}

interface FieldProps {
  label: string
  required?: boolean
  children: React.ReactNode
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:opacity-60'

const selectCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:opacity-60'

export default function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const owner = useUser()
  const sp = use(searchParams)
  const router = useRouter()

  const [tab, setTab] = useState<'ai' | 'manual' | 'inventory'>('manual')
  const [products, setProducts] = useState<Product[]>([])
  const [supabaseOk, setSupabaseOk] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dispatchOrder, setDispatchOrder] = useState<{
    order_code: string; client_name: string; phone: string;
    address: string; complement: string; product_ref: string;
    detail: string; value_to_collect: number; comment: string;
    payment_timing?: PaymentTiming; prepaid_amount?: number;
  } | null>(null)

  const prefillDate = typeof sp.date === 'string' ? sp.date : todayString()

  const [form, setForm] = useState<OrderForm>({
    ...EMPTY_FORM,
    order_date: prefillDate,
  })

  function setField<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  useEffect(() => {
    async function loadProducts() {
      try {
        const hasOwner = await isOwnerSupported()
        let query = supabase.from('products').select('*')
        if (hasOwner) query = query.eq('owner', owner)
        query = query.eq('active', true).order('name')
        const { data, error } = await query

        if (error) throw error
        setProducts(data ?? [])
        setSupabaseOk(true)
      } catch {
        setProducts([])
        setSupabaseOk(false)
      }
    }
    loadProducts()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.client_name.trim()) {
      toast.error('El nombre del cliente es requerido')
      return
    }
    if (!form.order_date) {
      toast.error('La fecha del pedido es requerida')
      return
    }
    if (!form.value_to_collect || isNaN(parseFloat(form.value_to_collect))) {
      toast.error('El valor a cobrar es requerido')
      return
    }

    setSaving(true)
    try {
      // Look up product cost
      const selectedProduct = products.find(
        (p) => p.code === form.product_ref || p.id === parseInt(form.product_ref),
      )
      const product_cost = selectedProduct?.cost ?? 0

      // Count existing orders for the date to generate a sequence number
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('order_date', form.order_date)

      const sequence = (count ?? 0) + 1
      const orderDate = new Date(form.order_date + 'T00:00:00')
      const order_code = generateOrderCode(orderDate, sequence)

      const hasOwner = await isOwnerSupported()
      const hasPaymentTiming = await isPaymentTimingSupported()
      const courierColumn = await courierPendingColumn()

      const valueToCollect = parseFloat(form.value_to_collect) || 0
      const prepaidAmount = normalizePrepaidAmount(form, valueToCollect)

      const payload: Record<string, unknown> = {
        order_code,
        client_name: form.client_name.trim(),
        phone: form.phone.trim(),
        city: form.city.trim() || DEFAULT_CITY,
        address: form.address.trim(),
        complement: composeComplement(form),
        product_ref: form.product_ref.trim(),
        detail: composeDetail(form),
        comment: form.comment.trim(),
        value_to_collect: valueToCollect,
        [courierColumn]: parseFloat(form.payment_courier_pending) || 0,
        payment_cash: parseFloat(form.payment_cash) || 0,
        payment_transfer: parseFloat(form.payment_transfer) || 0,
        product_cost,
        delivery_type: form.delivery_type || '',
        vendor: vendorDisplayName(owner),
        delivery_status: form.delivery_status,
        is_exchange: form.is_exchange,
        order_date: form.order_date,
        operating_cost: 0,
        status_complement: '',
        dispatch_date: null,
        guide_number: '',
        prepaid_amount: prepaidAmount,
      }
      if (hasOwner) payload.owner = owner
      if (hasPaymentTiming) payload.payment_timing = form.payment_timing || 'ContraEntrega'

      const { error } = await supabase.from('orders').insert(payload)
      if (error) throw error

      // Sincronización con inventario: descuenta si existe (nunca negativo)
      // o crea un registro en cero con el costo de referencia para contabilidad.
      const inventoryResult = await syncInventoryOnOrderSave({
        owner,
        hasOwner,
        productRef: form.product_ref.trim(),
        detail: composeDetail(form),
        searchTerm: `${form.detail_model} ${form.detail_color} ${form.detail_size}`.trim(),
        quantity: Math.max(1, parseInt(form.detail_quantity, 10) || 1),
        product: selectedProduct ?? null,
      })

      if (inventoryResult.createdZeroStock) {
        toast('Producto nuevo: creé un registro en inventario con stock 0 y costo de referencia', { icon: '📦', duration: 4000 })
      }

      toast.success(`Pedido ${order_code} creado exitosamente`)
      router.push(`/orders/daily/${form.order_date}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear el pedido'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`mx-auto max-w-3xl ${tab === 'manual' ? 'space-y-6' : 'flex flex-col h-[calc(100dvh-6rem)] md:h-auto md:space-y-6'}`}>
      {/* Header */}
      <div className={tab !== 'manual' ? 'shrink-0' : ''}>
        <button
          onClick={() => router.back()}
          className="mb-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Volver
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo</h1>
      </div>

      {!supabaseOk && <SupabaseBanner />}

      {/* Tab toggle */}
      <div className={`flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 ${tab !== 'manual' ? 'shrink-0 mt-4' : ''}`}>
        <button
          type="button"
          onClick={() => setTab('ai')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            tab === 'ai'
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bot className="h-4 w-4" />
          Pedido IA
        </button>
        <button
          type="button"
          onClick={() => setTab('manual')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            tab === 'manual'
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Pedido Manual
        </button>
        <button
          type="button"
          onClick={() => setTab('inventory')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
            tab === 'inventory'
              ? 'bg-white text-purple-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="h-4 w-4" />
          Inventario IA
        </button>
      </div>

      {/* AI Tab — saves immediately and shows dispatch guide */}
      {tab === 'ai' && (
        <div className="rounded-2xl border border-purple-100 bg-white overflow-hidden shadow-sm flex-1 min-h-0 mt-4 md:mt-0 flex flex-col">
          <AIOrderInput onOrderConfirmed={async (parsed: ParsedOrder) => {
            setSaving(true);
            try {
              const orderDate = todayString();

              // Look up product cost
              const selectedProduct = products.find(
                (p) => p.code === parsed.product_ref || p.name === parsed.product_ref,
              );
              const product_cost = selectedProduct?.cost ?? 0;

              // Count existing orders for today to generate sequence
              const { count } = await supabase
                .from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('order_date', orderDate);

              const sequence = (count ?? 0) + 1;
              const orderDateObj = new Date(orderDate + 'T00:00:00');
              const order_code = generateOrderCode(orderDateObj, sequence);

              const hasOwner = await isOwnerSupported();
              const courierColumnAi = await courierPendingColumn();
              const payload: Record<string, unknown> = {
                order_code,
                client_name: parsed.client_name?.trim() ?? '',
                phone: parsed.phone?.trim() ?? '',
                city: parsed.city?.trim() ?? '',
                address: parsed.address?.trim() ?? '',
                complement: parsed.complement?.trim() ?? '',
                product_ref: parsed.product_ref?.trim() ?? '',
                detail: parsed.detail?.trim() ?? '',
                comment: parsed.comment?.trim() ?? '',
                value_to_collect: parsed.value_to_collect ?? 0,
                [courierColumnAi]: 0,
                payment_cash: 0,
                payment_transfer: 0,
                product_cost,
                delivery_type: 'Mensajeria',
                vendor: 'Paola',
                delivery_status: 'Confirmado',
                is_exchange: false,
                order_date: orderDate,
                operating_cost: 0,
                status_complement: '',
                dispatch_date: null,
                guide_number: '',
                prepaid_amount: 0,
              };
              if (hasOwner) payload.owner = owner;

              const { error } = await supabase.from('orders').insert(payload);
              if (error) throw error;

              toast.success('Pedido guardado. Guía lista para imprimir.');
              setDispatchOrder({
                order_code,
                client_name: parsed.client_name ?? '',
                phone: parsed.phone ?? '',
                address: parsed.address ?? '',
                complement: parsed.complement ?? '',
                product_ref: parsed.product_ref ?? '',
                detail: parsed.detail ?? '',
                value_to_collect: parsed.value_to_collect ?? 0,
                comment: parsed.comment ?? '',
              });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Error al guardar el pedido';
              toast.error(msg);
            } finally {
              setSaving(false);
            }
          }} />
        </div>
      )}

      {/* Inventory AI Tab */}
      {tab === 'inventory' && (
        <div className="rounded-2xl border border-purple-100 bg-white overflow-hidden shadow-sm flex-1 min-h-0 mt-4 md:mt-0 flex flex-col">
          <AIInventoryInput onItemsConfirmed={async (items) => {
            setSaving(true);
            try {
              const hasOwner = await isOwnerSupported();
              const rows = items.map((item) => {
                const row: Record<string, unknown> = {
                  model: item.model,
                  category: item.category,
                  product_id: item.product_id,
                  color: item.color,
                  size: item.size,
                  quantity: item.quantity,
                  basket_location: item.basket_location,
                  type: item.type,
                  observations: item.observations,
                  status: 'Bueno',
                  verified: false,
                };
                if (hasOwner) row.owner = owner;
                return row;
              });

              const { error } = await supabase.from('inventory').insert(rows);
              if (error) throw error;

              toast.success(`${items.length} item${items.length !== 1 ? 's' : ''} agregado${items.length !== 1 ? 's' : ''} al inventario`);
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Error al guardar el inventario';
              toast.error(msg);
            } finally {
              setSaving(false);
            }
          }} />
        </div>
      )}

      {/* Dispatch Guide Modal */}
      {dispatchOrder && (
        <DispatchGuide
          order={dispatchOrder}
          onClose={() => setDispatchOrder(null)}
        />
      )}

      {/* Manual form */}
      {tab === 'manual' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section: Cliente */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Datos del Cliente
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del Cliente" required>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="María García"
                  value={form.client_name}
                  onChange={(e) => setField('client_name', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  type="tel"
                  className={inputCls}
                  placeholder="3001234567"
                  value={form.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Ciudad">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Bogotá (por defecto)"
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Dirección">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Cra 15 # 80-25"
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Barrio">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Chapinero Alto"
                  value={form.neighborhood}
                  onChange={(e) => setField('neighborhood', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Localidad">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Usaquén"
                  value={form.locality}
                  onChange={(e) => setField('locality', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Sector / Conjunto">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Conjunto Las Aguas"
                  value={form.sector}
                  onChange={(e) => setField('sector', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Complemento">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Apto 301, Torre B"
                  value={form.complement}
                  onChange={(e) => setField('complement', e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>
            <p className="text-[11px] text-gray-400">
              Si dejas vacía la ciudad, se guardará como <b>Bogotá</b>.
            </p>
          </div>

          {/* Section: Producto */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Producto y Detalle
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Referencia de Producto">
                {products.length > 0 ? (
                  <select
                    className={selectCls}
                    value={form.product_ref}
                    onChange={(e) => setField('product_ref', e.target.value)}
                    disabled={saving}
                  >
                    <option value="">— Seleccionar —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="REF-001"
                    value={form.product_ref}
                    onChange={(e) => setField('product_ref', e.target.value)}
                    disabled={saving}
                  />
                )}
              </Field>
              <Field label="Cantidad">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className={inputCls}
                  placeholder="1"
                  value={form.detail_quantity}
                  onChange={(e) => setField('detail_quantity', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Talla">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="37, M, XL..."
                  value={form.detail_size}
                  onChange={(e) => setField('detail_size', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Color">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Negro, Rosado..."
                  value={form.detail_color}
                  onChange={(e) => setField('detail_color', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Modelo / Variante">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Modelo Estrella"
                  value={form.detail_model}
                  onChange={(e) => setField('detail_model', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Observación extra (opcional)">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Regalo para una amiga, envolver..."
                    value={form.detail}
                    onChange={(e) => setField('detail', e.target.value)}
                    disabled={saving}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Comentario">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Nota especial, referencia alternativa..."
                    value={form.comment}
                    onChange={(e) => setField('comment', e.target.value)}
                    disabled={saving}
                  />
                </Field>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Los campos estructurados se guardan junto al detalle como &quot;Talla: 37 · Color: Negro · ...&quot; para que luego puedas filtrar la lista de pedidos por talla o color.
            </p>
          </div>

          {/* Section: Valores */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Valores y Pago
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor a Cobrar (COP)" required>
                <input
                  type="number"
                  min="0"
                  step="100"
                  className={inputCls}
                  placeholder="65000"
                  value={form.value_to_collect}
                  onChange={(e) => setField('value_to_collect', e.target.value)}
                  disabled={saving}
                />
              </Field>
              <Field label="Tipo de pago">
                <select
                  className={selectCls}
                  value={form.payment_timing}
                  onChange={(e) => setField('payment_timing', e.target.value as PaymentTiming)}
                  disabled={saving}
                >
                  {PAYMENT_TIMING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            {form.payment_timing === 'Anticipado' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <b>Pago anticipado:</b> el cliente ya pagó el total. En la guía aparecerá
                <b> &ldquo;YA PAGADO&rdquo;</b> para que el despachador no recaude nada.
              </div>
            )}

            {form.payment_timing === 'Mixto' && (
              <Field label="Abono anticipado (COP)">
                <input
                  type="number"
                  min="0"
                  step="100"
                  className={inputCls}
                  placeholder="30000"
                  value={form.prepaid_amount}
                  onChange={(e) => setField('prepaid_amount', e.target.value)}
                  disabled={saving}
                />
              </Field>
            )}

            {form.payment_timing === 'Otro' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <b>Otro tipo de pago</b> (crédito, especie, canje…). Usa el campo &ldquo;Comentario&rdquo;
                arriba para describir cómo se pagó.
              </div>
            )}

            {(form.payment_timing === 'ContraEntrega' || form.payment_timing === 'Mixto') && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  Indicá cómo se recibió el pago según corresponda. Si el mensajero
                  aún no liquidó la plata, va en <b>Pendiente del mensajero</b>.
                </p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Pendiente del mensajero (COP)">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className={inputCls}
                      placeholder="0"
                      value={form.payment_courier_pending}
                      onChange={(e) => setField('payment_courier_pending', e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="Efectivo en caja (COP)">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className={inputCls}
                      placeholder="0"
                      value={form.payment_cash}
                      onChange={(e) => setField('payment_cash', e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                  <Field label="Transferencia / Nequi (COP)">
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className={inputCls}
                      placeholder="0"
                      value={form.payment_transfer}
                      onChange={(e) => setField('payment_transfer', e.target.value)}
                      disabled={saving}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Section: Logística */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
              Logística
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tipo de Envío">
                <select
                  className={selectCls}
                  value={form.delivery_type}
                  onChange={(e) => setField('delivery_type', e.target.value as DeliveryType)}
                  disabled={saving}
                >
                  <option value="">— Seleccionar —</option>
                  {DELIVERY_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Estado">
                <select
                  className={selectCls}
                  value={form.delivery_status}
                  onChange={(e) =>
                    setField('delivery_status', e.target.value as DeliveryStatus)
                  }
                  disabled={saving}
                >
                  <option value="Confirmado">Confirmado</option>
                  <option value="Entregado">Entregado</option>
                  <option value="Devolucion">Devolucion</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </Field>
              <Field label="Fecha del Pedido" required>
                <input
                  type="date"
                  className={inputCls}
                  value={form.order_date}
                  onChange={(e) => setField('order_date', e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            {/* Exchange toggle */}
            <label className="flex cursor-pointer items-center gap-3 pt-1">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.is_exchange}
                  onChange={(e) => setField('is_exchange', e.target.checked)}
                  disabled={saving}
                />
                <div
                  className="h-6 w-10 rounded-full transition-colors duration-200"
                  style={{ background: form.is_exchange ? '#7c3aed' : '#e2e8f0' }}
                />
                <div
                  className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                  style={{
                    transform: form.is_exchange ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">Es cambio / devolución</span>
            </label>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pb-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-[2] rounded-xl py-3 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Guardando...
                </span>
              ) : (
                'Crear Pedido'
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
