'use client'

import { use, useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Plus, Search, Pencil, Trash2, X, Check, AlertTriangle, PackageSearch, Download, Camera, HelpCircle, ImagePlus, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/lib/types'
import { cn, formatCurrency, parseCopAmount } from '@/lib/utils'
import { downloadExcel } from '@/lib/export'
import ProductPhotoAI from '@/components/products/ProductPhotoAI'
import PageHelpModal from '@/components/shared/PageHelpModal'
import { PRODUCTS_HELP } from '@/lib/pageHelp'
import { useUser } from '@/lib/UserContext'
import { useTenant } from '@/lib/TenantContext'
import { isOwnerSupported } from '@/lib/db'
import { productUsage, type ProductUsage } from '@/lib/plans'

// Categoría comodín que siempre se ofrece además de las propias del negocio.
const CATCH_ALL_CATEGORY = 'Otro'

const EMPTY_FORM = {
  code: '',
  name: '',
  cost: '',
  category: '',
  active: true,
  image_url: '',
}

function SupabaseBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <span>
        Supabase no está configurado. Los datos mostrados son de ejemplo. Configura{' '}
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> y{' '}
        <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> para
        activar la base de datos.
      </span>
    </div>
  )
}

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}

function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

async function syncInventoryReference(
  product: Product,
  newCost: number,
  hasOwner: boolean,
  owner: string,
): Promise<number> {
  const nameToken = product.name.trim().toLowerCase().split(/\s+/)[0]
  if (!nameToken && !product.code) return 0
  let iq = supabase.from('inventory').select('id')
  if (hasOwner) iq = iq.eq('owner', owner)
  if (product.code) iq = iq.eq('product_id', product.code)
  const { data: byCode } = await iq
  let targets = byCode ?? []
  if (targets.length === 0 && nameToken) {
    let iq2 = supabase.from('inventory').select('id')
    if (hasOwner) iq2 = iq2.eq('owner', owner)
    iq2 = iq2.ilike('model', `%${nameToken}%`)
    const { data: byModel } = await iq2
    targets = byModel ?? []
  }
  if (targets.length === 0) return 0
  const { error } = await supabase
    .from('inventory')
    .update({ reference: newCost })
    .in('id', targets.map((t) => t.id))
  if (error) return 0
  return targets.length
}

// Paleta estable: cada categoría (sea de la industria que sea) recibe siempre el
// mismo color, derivado de su nombre. Así no hay que mantener un mapa por negocio.
const CATEGORY_PALETTE = [
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
  'bg-rose-100 text-rose-700',
]

function categoryColor(category: string): string {
  if (!category || category === CATCH_ALL_CATEGORY) return 'bg-gray-100 text-gray-600'
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length]
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        categoryColor(category),
      )}
    >
      {category}
    </span>
  )
}

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  // searchParams not used but accepted per Next.js 16 convention
  void use(searchParams)

  const owner = useUser()
  const { config } = useTenant()
  // Categorías propias del negocio (de su config por industria) + la comodín
  // "Otro". Antes estaban hardcodeadas a pantuflas para todos los negocios.
  const categories = useMemo(() => {
    const base = config.categories?.length ? config.categories : []
    return Array.from(new Set([...base, CATCH_ALL_CATEGORY]))
  }, [config.categories])

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [supabaseOk, setSupabaseOk] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [showPhotoAI, setShowPhotoAI] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  // Uso del cupo de productos del plan (preemptivo). null = aún no disponible
  // (p. ej. el usuario no es admin: /api/billing devuelve 403). El tope real lo
  // sigue enforzando la BD; esto es solo UX.
  const [usage, setUsage] = useState<ProductUsage | null>(null)

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/billing', { cache: 'no-store' })
      if (!res.ok) {
        setUsage(null)
        return
      }
      const json = await res.json()
      if (json && !json.error && typeof json.productCount === 'number') {
        setUsage(productUsage(json.productCount, json.productLimit ?? null))
      } else {
        setUsage(null)
      }
    } catch {
      setUsage(null)
    }
  }, [])

  useEffect(() => {
    fetchUsage()
  }, [fetchUsage])

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const hasOwner = await isOwnerSupported()
      let query = supabase.from('products').select('*')
      if (hasOwner) query = query.eq('owner', owner)
      query = query.order('created_at', { ascending: false })
      const { data, error } = await query

      if (error) throw error
      setProducts(data ?? [])
      setSupabaseOk(true)
    } catch {
      setProducts([])
      setSupabaseOk(false)
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.code.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()),
  )

  // Tope alcanzado según el plan (solo si /api/billing estaba disponible).
  const atPlanLimit = usage?.atLimit ?? false

  function openAdd() {
    if (atPlanLimit) {
      toast.error('Alcanzaste el límite de productos de tu plan. Sube de plan para agregar más.')
      return
    }
    setEditingProduct(null)
    setForm({ ...EMPTY_FORM, category: categories[0] ?? CATCH_ALL_CATEGORY })
    setModalOpen(true)
  }

  function openEdit(product: Product) {
    setEditingProduct(product)
    setForm({
      code: product.code,
      name: product.name,
      cost: String(product.cost),
      category: product.category || categories[0] || CATCH_ALL_CATEGORY,
      active: product.active,
      image_url: product.image_url ?? '',
    })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditingProduct(null)
    setForm({ ...EMPTY_FORM })
  }

  // Sube una foto al storage del negocio y guarda su URL en el formulario.
  // Reutiliza /api/upload-image (valida tipo y tamaño, namespacea por tenant).
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-subir el mismo archivo
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Formato no permitido (usa JPG, PNG o WEBP)')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen supera 5 MB')
      return
    }
    setUploadingPhoto(true)
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) throw new Error(json.error || 'No se pudo subir la imagen')
      setForm((f) => ({ ...f, image_url: json.url }))
      toast.success('Foto subida')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen')
    } finally {
      setUploadingPhoto(false)
    }
  }

  async function handleSave() {
    if (!form.code.trim()) {
      toast.error('El código del producto es requerido')
      return
    }
    if (!form.name.trim()) {
      toast.error('El nombre del producto es requerido')
      return
    }
    if (!form.cost || !String(form.cost).trim()) {
      toast.error('El costo del producto es requerido')
      return
    }
    const cost = parseCopAmount(form.cost)
    if (cost === null) {
      toast.error('El costo debe ser un número válido (ej: 45000 o $45.000)')
      return
    }
    // Check for duplicate code (only when creating, or when editing and code changed)
    const codeUpper = form.code.trim().toUpperCase()
    const isDuplicate = products.some(
      (p) => p.code.toUpperCase() === codeUpper && p.id !== editingProduct?.id
    )
    if (isDuplicate) {
      toast.error(`Ya existe un producto con el código "${codeUpper}"`)
      return
    }
    setSaving(true)
    try {
      const hasOwner = await isOwnerSupported()
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        cost,
        category: form.category,
        active: form.active,
        image_url: form.image_url || null,
      }
      if (hasOwner) payload.owner = owner
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
        if (error) throw error
        let msg = 'Producto actualizado'
        if (editingProduct.cost !== cost) {
          const synced = await syncInventoryReference(editingProduct, cost, hasOwner, owner)
          if (synced > 0) msg = `Producto actualizado · ${synced} item(s) de inventario sincronizados`
        }
        toast.success(msg)
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
        toast.success('Producto creado')
      }
      closeModal()
      await fetchProducts()
      await fetchUsage()
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Error al guardar'
      // El trigger de límite de plan lanza un mensaje con prefijo PLAN_LIMIT.
      const msg = raw.includes('PLAN_LIMIT')
        ? 'Alcanzaste el límite de productos de tu plan. Sube de plan para agregar más.'
        : raw
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('products').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast.success('Producto eliminado')
      setDeleteTarget(null)
      await fetchProducts()
      await fetchUsage()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Catalogo de Productos</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {usage && usage.limit !== null ? (
              <>
                <span className={cn('font-semibold', atPlanLimit ? 'text-red-600' : usage.nearLimit ? 'text-amber-600' : 'text-gray-700')}>
                  {usage.count}/{usage.limit}
                </span>{' '}
                productos del plan
              </>
            ) : (
              <>
                {products.length} producto{products.length !== 1 ? 's' : ''} registrado
                {products.length !== 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700"
            title="¿Qué hace esta pantalla?"
            aria-label="Ayuda de Productos"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Ayuda</span>
          </button>
          <button
            onClick={async () => {
              try {
                await downloadExcel('products', { owner })
              } catch {
                toast.error('Error al exportar')
              }
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700"
            aria-label="Exportar productos"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={() => setShowPhotoAI(true)}
            disabled={atPlanLimit}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-purple-300 bg-purple-50 px-3 py-2.5 text-sm font-semibold text-purple-700 transition-all hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-purple-50"
            aria-label="Nuevo producto con foto IA"
            title={atPlanLimit ? 'Alcanzaste el límite de productos de tu plan' : undefined}
          >
            <Camera className="h-4 w-4" />
            <span className="hidden sm:inline">Con Foto IA</span>
          </button>
          <button
            onClick={openAdd}
            disabled={atPlanLimit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:flex-none"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
            title={atPlanLimit ? 'Alcanzaste el límite de productos de tu plan' : undefined}
          >
            <Plus className="h-4 w-4" />
            <span className="sm:inline">Nuevo</span>
            <span className="hidden sm:inline">&nbsp;Producto</span>
          </button>
        </div>
      </div>

      {!supabaseOk && <SupabaseBanner />}

      {/* Aviso de cupo del plan (preemptivo; el tope real lo enforza la BD) */}
      {usage && usage.limit !== null && atPlanLimit && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span>
            Alcanzaste el límite de tu plan ({usage.count}/{usage.limit} productos). Sube de plan
            para agregar más productos.
          </span>
        </div>
      )}
      {usage && usage.limit !== null && !atPlanLimit && usage.nearLimit && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Estás cerca del límite de tu plan ({usage.count}/{usage.limit} productos). Considera
            subir de plan para no quedarte sin cupo.
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, código o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-800 outline-none transition-all focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: '#7c3aed', borderTopColor: 'transparent' }}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <PackageSearch className="h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">
            {search ? 'No se encontraron productos con ese criterio' : 'No hay productos aún'}
          </p>
          {!search && (
            <button
              onClick={openAdd}
              className="mt-1 text-sm font-medium text-purple-600 hover:text-purple-700"
            >
              Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Código</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Nombre</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Costo</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Categoría</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Estado</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-4 font-mono text-xs font-medium text-purple-700">
                      {product.code}
                    </td>
                    <td className="px-5 py-4 font-medium text-gray-800">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-9 w-9 shrink-0 rounded-lg border border-gray-100 object-cover"
                          />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-gray-50">
                            <PackageSearch className="h-4 w-4 text-gray-300" />
                          </span>
                        )}
                        <span>{product.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{formatCurrency(product.cost)}</td>
                    <td className="px-5 py-4">
                      <CategoryBadge category={product.category} />
                    </td>
                    <td className="px-5 py-4">
                      {product.active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          <Check className="h-3 w-3" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          <X className="h-3 w-3" />
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(product)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                          title="Editar"
                          aria-label="Editar producto"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(product)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="Eliminar"
                          aria-label="Eliminar producto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-12 w-12 shrink-0 rounded-xl border border-gray-100 object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-100 bg-gray-50">
                      <PackageSearch className="h-5 w-5 text-gray-300" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-purple-600">
                        {product.code}
                      </span>
                      <CategoryBadge category={product.category} />
                    </div>
                    <p className="mt-1 truncate font-semibold text-gray-800">{product.name}</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-600">
                      {formatCurrency(product.cost)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {product.active ? (
                      <span className="inline-block whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Activo
                      </span>
                    ) : (
                      <span className="inline-block whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Inactivo
                      </span>
                    )}
                    <button
                      onClick={() => openEdit(product)}
                      aria-label="Editar producto"
                      className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(product)}
                      aria-label="Eliminar producto"
                      className="rounded-lg p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        title={editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
        onClose={closeModal}
      >
        <div className="space-y-4">
          {/* Foto del producto */}
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
              {form.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt="Foto del producto" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-6 w-6 text-gray-300" />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {uploadingPhoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {form.image_url ? 'Cambiar foto' : 'Subir foto'}
              </button>
              {form.image_url && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image_url: '' }))}
                  className="text-left text-xs font-medium text-red-500 hover:text-red-600"
                >
                  Quitar foto
                </button>
              )}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-600">
                Código <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.slice(0, 10) }))}
                maxLength={10}
                placeholder="REF-001"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-600">
                Categoría <span className="text-red-400">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
              >
                {/* Categoría legada (de datos viejos o de otra config) que ya no
                    está en la lista del negocio: se muestra para no perderla ni
                    cambiarla en silencio al editar. */}
                {form.category && !categories.includes(form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-600">
              Nombre <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Pantufla acolchada talla M"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-600">
              Costo (COP) <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              placeholder="45000  o  $45.000"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
            {form.cost && parseCopAmount(form.cost) !== null && (
              <p className="text-[11px] text-gray-500">
                Se guardará como {formatCurrency(parseCopAmount(form.cost) ?? 0)}
              </p>
            )}
          </div>

          {/* Active toggle */}
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <div
                className="h-6 w-10 rounded-full transition-colors duration-200"
                style={{ background: form.active ? '#7c3aed' : '#e2e8f0' }}
              />
              <div
                className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: form.active ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">Producto activo</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={closeModal}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-70"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)' }}
            >
              {saving ? 'Guardando...' : editingProduct ? 'Actualizar' : 'Crear Producto'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        title="Eliminar Producto"
        onClose={() => setDeleteTarget(null)}
      >
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">{deleteTarget?.name}</p>
              <p className="text-sm text-gray-500">
                Esta accion no se puede deshacer. El producto sera eliminado permanentemente.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-70"
              style={{ background: '#ef4444' }}
            >
              {deleting ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      </Modal>

      {helpOpen && <PageHelpModal content={PRODUCTS_HELP} onClose={() => setHelpOpen(false)} />}

      {/* Photo AI Modal */}
      {showPhotoAI && (
        <ProductPhotoAI
          onClose={() => setShowPhotoAI(false)}
          onProductAnalyzed={(analyzed) => {
            setShowPhotoAI(false);
            setForm({
              // products.code es VARCHAR(10): recortamos el código sugerido por
              // la IA para que el insert no falle por longitud.
              code: (analyzed.code || '').slice(0, 10),
              name: analyzed.name,
              cost: String(analyzed.suggested_cost),
              category: categories.includes(analyzed.category) ? analyzed.category : CATCH_ALL_CATEGORY,
              active: true,
              image_url: analyzed.image_url ?? '',
            });
            setEditingProduct(null);
            setModalOpen(true);
            toast.success('Datos del producto cargados. Revisa y guarda.');
          }}
        />
      )}
    </div>
  )
}
