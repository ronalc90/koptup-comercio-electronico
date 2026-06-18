'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  Plus,
  Search,
  Package,
  Layers,
  AlertTriangle,
  CheckCircle,
  X,
  Edit2,
  Trash2,
  Download,
  HelpCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { InventoryItem } from '@/lib/types'
import { cn, formatCurrency } from '@/lib/utils'
import { downloadExcel } from '@/lib/export'
import { useUser } from '@/lib/UserContext'
import { isOwnerSupported } from '@/lib/db'
import PhotoCapture from '@/components/shared/PhotoCapture'
import ImageLightbox from '@/components/shared/ImageLightbox'
import PageHelpModal from '@/components/shared/PageHelpModal'
import { INVENTORY_HELP } from '@/lib/pageHelp'
import { useTenant } from '@/lib/TenantContext'

const COLORS = ['Negro', 'Blanco', 'Gris', 'Beige', 'Rosado', 'Azul', 'Verde', 'Rojo', 'Morado', 'Multicolor']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '35', '36', '37', '38', '39', '40', '41', '42', 'Única']
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const EMPTY_FORM: Omit<InventoryItem, 'id' | 'created_at'> = {
  basket_location: '',
  product_id: '',
  category: '',
  type: '',
  reference: 0,
  model: '',
  color: '',
  size: '',
  quantity: 1,
  status: 'Bueno',
  observations: '',
  verified: false,
  image_url: '',
}

interface ModalProps {
  item: Partial<InventoryItem> | null
  onClose: () => void
  onSave: (item: Partial<InventoryItem>) => Promise<void>
  saving: boolean
  /** Categorías propias del negocio (vienen del padre, según su industria). */
  categories: string[]
}

function InventoryModal({ item, onClose, onSave, saving, categories }: ModalProps) {
  const [form, setForm] = useState<Omit<InventoryItem, 'id' | 'created_at'>>(
    item
      ? {
          basket_location: item.basket_location ?? '',
          product_id: item.product_id ?? '',
          category: item.category ?? '',
          type: item.type ?? '',
          reference: item.reference ?? 0,
          model: item.model ?? '',
          color: item.color ?? '',
          size: item.size ?? '',
          quantity: item.quantity ?? 1,
          status: item.status ?? 'Bueno',
          observations: item.observations ?? '',
          verified: item.verified ?? false,
          image_url: item.image_url ?? '',
        }
      : { ...EMPTY_FORM }
  )

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const isEdit = !!(item && 'id' in item && item.id)

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
      <div className="w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-white shadow-xl max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Editar Producto' : 'Agregar Producto'}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 overflow-y-auto flex-1 min-h-0">
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Canasta</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                value={form.basket_location}
                onChange={(e) => set('basket_location', e.target.value)}
                placeholder="Ej: A1"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ID Producto</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                value={form.product_id}
                onChange={(e) => set('product_id', e.target.value)}
                placeholder="Ej: P001"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Categoría</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              <option value="">Seleccionar</option>
              {/* Conserva una categoría legada (de datos viejos o de otra config)
                  que ya no está en la lista del negocio, para no perderla ni
                  cambiarla en silencio al editar. */}
              {form.category && !categories.includes(form.category) && (
                <option value={form.category}>{form.category}</option>
              )}
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              placeholder="Ej: Cerrada, Abierta"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Costo (COP)</label>
            <input
              type="number"
              min={0}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.reference}
              onChange={(e) => set('reference', Math.max(0, Number(e.target.value) || 0))}
              placeholder="45000"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Modelo</label>
            <input
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              placeholder="Ej: Fluffy"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Color</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.color}
              onChange={(e) => set('color', e.target.value)}
            >
              <option value="">Seleccionar</option>
              {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Talla</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.size}
              onChange={(e) => set('size', e.target.value)}
            >
              <option value="">Seleccionar</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Cantidad</label>
            <input
              type="number"
              min={0}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.quantity}
              onChange={(e) => set('quantity', Number(e.target.value))}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.status}
              onChange={(e) => set('status', e.target.value as 'Bueno' | 'Malo')}
            >
              <option value="Bueno">Bueno</option>
              <option value="Malo">Malo / Defectuoso</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Observaciones</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={form.observations}
              onChange={(e) => set('observations', e.target.value)}
            />
          </div>

          <div className="col-span-2">
            <label className="mb-1 block text-xs font-medium text-gray-600">Foto del producto</label>
            <PhotoCapture
              currentUrl={form.image_url}
              onPhotoReady={(url) => set('image_url', url)}
              compact={!!form.image_url}
            />
          </div>

          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="verified"
              checked={form.verified}
              onChange={(e) => set('verified', e.target.checked)}
              className="h-4 w-4 accent-purple-600"
            />
            <label htmlFor="verified" className="text-sm text-gray-700">Verificado</label>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4 shrink-0" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave({ ...form, ...(isEdit ? { id: item!.id } : {}) })}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: '#7c3aed' }}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InventoryPage() {
  const owner = useUser()
  const { config } = useTenant()
  // Categorías propias del negocio (config por industria) + comodín "Otro".
  const categories = useMemo(
    () => Array.from(new Set([...(config.categories ?? []), 'Otro'])),
    [config.categories],
  )
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)
  const [view, setView] = useState<'verified' | 'defective'>('verified')
  const [search, setSearch] = useState('')
  const [filterModel, setFilterModel] = useState('')
  const [filterColor, setFilterColor] = useState('')
  const [filterSize, setFilterSize] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<InventoryItem | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const hasOwner = await isOwnerSupported()
      let query = supabase.from('inventory').select('*')
      if (hasOwner) query = query.eq('owner', owner)
      query = query.order('created_at', { ascending: false })
      const { data, error } = await query
      if (error) throw error
      setItems(data ?? [])
    } catch (err) {
      console.error(err)
      toast.error('Error al cargar el inventario')
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const filtered = items.filter((item) => {
    const matchView = view === 'verified' ? item.status === 'Bueno' : item.status === 'Malo'
    const matchSearch =
      !search ||
      item.model.toLowerCase().includes(search.toLowerCase()) ||
      item.product_id.toLowerCase().includes(search.toLowerCase()) ||
      item.basket_location.toLowerCase().includes(search.toLowerCase())
    const matchModel = !filterModel || item.model === filterModel
    const matchColor = !filterColor || item.color === filterColor
    const matchSize = !filterSize || item.size === filterSize
    const matchCategory = !filterCategory || item.category === filterCategory
    return matchView && matchSearch && matchModel && matchColor && matchSize && matchCategory
  })

  const totalUnits = filtered.reduce((sum, i) => sum + i.quantity, 0)

  const modelCounts = filtered.reduce<Record<string, number>>((acc, item) => {
    if (item.model) acc[item.model] = (acc[item.model] ?? 0) + item.quantity
    return acc
  }, {})
  const top3Models = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  const uniqueModels = [...new Set(items.map((i) => i.model).filter(Boolean))]

  async function handleSave(data: Partial<InventoryItem>) {
    setSaving(true)
    try {
      const hasOwner = await isOwnerSupported()
      if (data.id) {
        const { id, created_at: _ca, ...rest } = data as InventoryItem
        const { error } = await supabase.from('inventory').update(rest).eq('id', id)
        if (error) throw error
        toast.success('Producto actualizado')
      } else {
        const { id: _id, created_at: _ca, ...rest } = data as InventoryItem
        const insertPayload: Record<string, unknown> = { ...rest }
        if (hasOwner) insertPayload.owner = owner
        const { error } = await supabase.from('inventory').insert(insertPayload)
        if (error) throw error
        toast.success('Producto agregado')
      }
      setModalOpen(false)
      setEditItem(null)
      await loadItems()
    } catch (err) {
      console.error(err)
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      const { error } = await supabase.from('inventory').delete().eq('id', id)
      if (error) throw error
      toast.success('Producto eliminado')
      await loadItems()
    } catch (err) {
      console.error(err)
      toast.error('Error al eliminar')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32 md:pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Inventario</h1>
              <p className="text-xs text-gray-500">{config.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHelpOpen(true)}
                className="flex items-center justify-center rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                title="¿Qué hace esta pantalla?"
                aria-label="Ayuda de Inventario"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              <button
                onClick={async () => {
                  try {
                    await downloadExcel('inventory', { owner })
                  } catch {
                    toast.error('Error al exportar')
                  }
                }}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700 transition-colors"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Exportar</span>
              </button>
              <button
                onClick={() => { setEditItem(null); setModalOpen(true) }}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
                style={{ background: '#7c3aed' }}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Agregar</span>
              </button>
            </div>
          </div>

          {/* View toggle */}
          <div className="mt-3 flex rounded-xl bg-gray-100 p-1 w-fit">
            <button
              onClick={() => setView('verified')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                view === 'verified' ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500'
              )}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Verificado
            </button>
            <button
              onClick={() => setView('defective')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                view === 'defective' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Defectuoso
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-4 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Total Items</p>
            <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500">Total Unidades</p>
            <p className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{totalUnits}</p>
          </div>
          {top3Models.map(([model, qty]) => (
            <div key={model} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
              <p className="text-xs text-gray-500 truncate">{model}</p>
              <p className="text-2xl font-bold" style={{ color: '#f59e0b' }}>{qty}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="col-span-2 sm:col-span-1 lg:col-span-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">Categoría</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={filterModel}
              onChange={(e) => setFilterModel(e.target.value)}
            >
              <option value="">Modelo</option>
              {uniqueModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={filterColor}
              onChange={(e) => setFilterColor(e.target.value)}
            >
              <option value="">Color</option>
              {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              value={filterSize}
              onChange={(e) => setFilterSize(e.target.value)}
            >
              <option value="">Talla</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2"
              style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package className="h-10 w-10 mb-2" />
            <p className="text-sm">No hay productos</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-2xl bg-white shadow-sm border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="px-4 py-3 text-left font-semibold">Canasta</th>
                    <th className="px-4 py-3 text-left font-semibold">ID Producto</th>
                    <th className="px-4 py-3 text-left font-semibold">Categoría</th>
                    <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold">Costo</th>
                    <th className="px-4 py-3 text-left font-semibold">Modelo</th>
                    <th className="px-4 py-3 text-left font-semibold">Color</th>
                    <th className="px-4 py-3 text-left font-semibold">Talla</th>
                    <th className="px-4 py-3 text-right font-semibold">Cantidad</th>
                    <th className="px-4 py-3 text-center font-semibold">Estado</th>
                    <th className="px-4 py-3 text-center font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={cn('border-b border-gray-50 hover:bg-gray-50', idx % 2 === 0 ? '' : 'bg-gray-50/30')}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{item.basket_location}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">{item.product_id}</td>
                      <td className="px-4 py-3 text-gray-700">{item.category}</td>
                      <td className="px-4 py-3 text-gray-700">{item.type}</td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(item.reference || 0)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{item.model}</td>
                      <td className="px-4 py-3 text-gray-700">{item.color}</td>
                      <td className="px-4 py-3 text-gray-700">{item.size}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{item.quantity}</td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            item.status === 'Bueno'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-red-100 text-red-700'
                          )}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setEditItem(item); setModalOpen(true) }}
                            aria-label="Editar producto"
                            className="rounded-lg p-1.5 hover:bg-purple-100 text-purple-600"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(item)}
                            aria-label="Eliminar producto"
                            className="rounded-lg p-1.5 hover:bg-red-100 text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((item) => (
                <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm border border-gray-100">
                  {item.image_url && (
                    <button
                      type="button"
                      onClick={() => setLightboxSrc(item.image_url!)}
                      className="block w-full mb-3 group"
                      aria-label="Ver foto ampliada"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.image_url}
                        alt={item.model}
                        className="w-full h-32 object-cover rounded-xl transition-transform group-hover:scale-[1.01] group-active:scale-95"
                      />
                    </button>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{item.model}</span>
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{item.product_id}</span>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            item.status === 'Bueno' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          )}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>Canasta: <strong className="text-gray-700">{item.basket_location}</strong></span>
                        <span>Categoría: <strong className="text-gray-700">{item.category}</strong></span>
                        <span>Color: <strong className="text-gray-700">{item.color}</strong></span>
                        <span>Talla: <strong className="text-gray-700">{item.size}</strong></span>
                        <span>Costo: <strong className="text-gray-700">{formatCurrency(item.reference || 0)}</strong></span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{item.quantity}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditItem(item); setModalOpen(true) }}
                          aria-label="Editar producto"
                          className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-purple-100 text-purple-600"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(item)}
                          aria-label="Eliminar producto"
                          className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-red-100 text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {item.observations && (
                    <p className="mt-2 text-xs text-gray-400 italic">{item.observations}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Summary bar */}
      <div className="fixed inset-x-0 z-40 bg-white border-t border-gray-100 px-4 py-2 shadow-lg md:bottom-0" style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="mx-auto max-w-6xl flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Layers className="h-4 w-4" style={{ color: '#7c3aed' }} />
            <span><strong className="text-gray-900">{filtered.length}</strong> referencias</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Package className="h-4 w-4" style={{ color: '#f59e0b' }} />
            <span><strong className="text-gray-900">{totalUnits}</strong> unidades en total</span>
          </div>
          {(search || filterModel || filterColor || filterSize || filterCategory) && (
            <button
              onClick={() => { setSearch(''); setFilterModel(''); setFilterColor(''); setFilterSize(''); setFilterCategory('') }}
              className="text-xs text-red-500 flex items-center gap-1 hover:underline"
            >
              <X className="h-3.5 w-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {helpOpen && <PageHelpModal content={INVENTORY_HELP} onClose={() => setHelpOpen(false)} />}

      {/* Modal */}
      {modalOpen && (
        <InventoryModal
          item={editItem}
          onClose={() => { setModalOpen(false); setEditItem(null) }}
          onSave={handleSave}
          saving={saving}
          categories={categories}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="w-full max-w-xs bg-white rounded-2xl shadow-xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">¿Eliminar producto?</h3>
            <p className="text-sm text-gray-500 mb-1">{deleteConfirm.model} {deleteConfirm.color}</p>
            <p className="text-xs text-gray-400 mb-4">Cantidad: {deleteConfirm.quantity} · {deleteConfirm.basket_location}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
                Cancelar
              </button>
              <button
                onClick={async () => { await handleDelete(deleteConfirm.id); setDeleteConfirm(null); }}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  )
}
