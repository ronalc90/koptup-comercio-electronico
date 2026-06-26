'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  Lock,
  Cpu,
  Store,
  LogOut,
  CheckCircle,
  XCircle,
  Phone,
  ChevronRight,
  Key,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  Info,
  MessageCircle,
  Globe,
  Palette,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  LayoutGrid,
  DollarSign,
  ShieldAlert,
  Printer,
  Image as ImageIcon,
  Trash2,
  AlertTriangle,
  HelpCircle,
  Minus,
  Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'
import { CHANGELOG } from '@/lib/changelog'
import {
  getPrintFontSize,
  setPrintFontSize,
  getPrintCustomSizes,
  setPrintCustomSizes,
  PRINT_FONT_LABELS,
  PRINT_SIZE_MIN,
  PRINT_SIZE_MAX,
  getUiFontSize,
  setUiFontSize,
  UI_FONT_LABELS,
  getThemeMode,
  setThemeMode,
  THEME_LABELS,
  getUiDensity,
  setUiDensity,
  getCurrencyFormat,
  setCurrencyFormat,
  CURRENCY_LABELS,
  getReduceMotion,
  setReduceMotion,
  getSoundsEnabled,
  setSoundsEnabled,
  getConfirmDestructive,
  setConfirmDestructive,
  getAutoOpenPrintDialog,
  setAutoOpenPrintDialog,
  getShowPrintLogo,
  setShowPrintLogo,
  clearAllPreferences,
  type PrintFontSize,
  type PrintSizes,
  type UiFontSize,
  type ThemeMode,
  type UiDensity,
  type CurrencyFormat,
} from '@/lib/preferences'
import { useUser } from '@/lib/UserContext'
import { useTenant } from '@/lib/TenantContext'
import { isAdministrativeRole } from '@/lib/permissions'
import { roleLabel } from '@/lib/tenant'
import ExcelImport from '@/components/shared/ExcelImport'
import { GuideCard } from '@/components/dispatch/DispatchGuide'
import { playSuccess, playTick, playError } from '@/lib/sound'
import PageHelpModal from '@/components/shared/PageHelpModal'
import { SETTINGS_HELP } from '@/lib/pageHelp'

interface SectionProps {
  icon: React.ReactNode
  title: string
  tone?: 'purple' | 'red' | 'amber'
  children: React.ReactNode
}

function Section({ icon, title, tone = 'purple', children }: SectionProps) {
  const toneBg =
    tone === 'red' ? '#ef4444' : tone === 'amber' ? '#f59e0b' : '#7c3aed'
  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
          style={{ background: toneBg }}
        >
          {icon}
        </div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

interface OptionRowProps<T extends string> {
  label: string
  description?: string
  value: T
  options: ReadonlyArray<{ value: T; label: string; icon?: React.ReactNode }>
  onChange: (v: T) => void
}

function OptionRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: OptionRowProps<T>) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-900">{label}</p>
      {description && <p className="mb-2 text-xs text-gray-500">{description}</p>}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all',
              value === opt.value
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-purple-600' : 'bg-gray-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

function emitPrefsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('meraki:prefs-changed'))
  }
}

function resolvedSystemLabel(): 'Claro' | 'Oscuro' {
  if (typeof window === 'undefined') return 'Claro'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'Oscuro' : 'Claro'
}

function PrintSizeStepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string
  value: number
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="rounded-lg bg-white border border-purple-100 px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onDec}
          aria-label={`Disminuir ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm font-bold text-gray-900 tabular-nums">
          {value.toFixed(1)}<span className="text-[10px] font-normal text-gray-500">pt</span>
        </span>
        <button
          type="button"
          onClick={onInc}
          aria-label={`Aumentar ${label}`}
          className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const owner = useUser()
  const { role, config } = useTenant()

  /* ─────── Contraseña ─────── */
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [changingPwd, setChangingPwd] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  /* ─────── Preferencias visuales ─────── */
  const [themeMode, setThemeModeState] = useState<ThemeMode>('light')
  const [uiFontSize, setUiFontSizeState] = useState<UiFontSize>('medium')
  const [uiDensity, setUiDensityState] = useState<UiDensity>('comfortable')
  const [reduceMotion, setReduceMotionState] = useState(false)

  /* ─────── Preferencias app ─────── */
  const [currencyFormat, setCurrencyFormatState] = useState<CurrencyFormat>('cop-nodecimals')
  const [soundsEnabled, setSoundsEnabledState] = useState(true)
  const [confirmDestructive, setConfirmDestructiveState] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  /* ─────── Preferencias de impresión ─────── */
  const [printFontSize, setPrintFontSizeState] = useState<PrintFontSize>('medium')
  const [printCustom, setPrintCustomState] = useState<PrintSizes>({ header: 11, body: 12, bold: 13, footer: 9 })
  const [autoOpenPrint, setAutoOpenPrintState] = useState(false)
  const [showPrintLogo, setShowPrintLogoState] = useState(true)

  useEffect(() => {
    setThemeModeState(getThemeMode(owner))
    setUiFontSizeState(getUiFontSize(owner))
    setUiDensityState(getUiDensity(owner))
    setReduceMotionState(getReduceMotion(owner))
    setCurrencyFormatState(getCurrencyFormat(owner))
    setSoundsEnabledState(getSoundsEnabled(owner))
    setConfirmDestructiveState(getConfirmDestructive(owner))
    setPrintFontSizeState(getPrintFontSize(owner))
    setPrintCustomState(getPrintCustomSizes(owner))
    setAutoOpenPrintState(getAutoOpenPrintDialog(owner))
    setShowPrintLogoState(getShowPrintLogo(owner))
  }, [owner])

  function handleThemeChange(v: ThemeMode) {
    setThemeModeState(v)
    setThemeMode(owner, v)
    emitPrefsChanged()
    playSuccess(owner)
    toast.success(`Tema: ${THEME_LABELS[v]}${v === 'system' ? ` (${resolvedSystemLabel()})` : ''}`)
  }

  function handleUiFontChange(v: UiFontSize) {
    setUiFontSizeState(v)
    setUiFontSize(owner, v)
    emitPrefsChanged()
    playSuccess(owner)
    toast.success(`Tamaño: ${UI_FONT_LABELS[v]}`)
  }

  function handleDensityChange(v: UiDensity) {
    setUiDensityState(v)
    setUiDensity(owner, v)
    emitPrefsChanged()
    playTick(owner)
  }

  function handleReduceMotionChange(v: boolean) {
    setReduceMotionState(v)
    setReduceMotion(owner, v)
    emitPrefsChanged()
    playTick(owner)
  }

  function handleCurrencyChange(v: CurrencyFormat) {
    setCurrencyFormatState(v)
    setCurrencyFormat(owner, v)
    playTick(owner)
  }

  function handleSoundsChange(v: boolean) {
    setSoundsEnabledState(v)
    setSoundsEnabled(owner, v)
    // Sonar solo al activar, para que el usuario escuche la diferencia.
    if (v) {
      setTimeout(() => playSuccess(owner), 60)
      toast.success('Sonidos activados')
    } else {
      toast('Sonidos apagados', { icon: '🔇' })
    }
  }

  function handleConfirmDestructiveChange(v: boolean) {
    setConfirmDestructiveState(v)
    setConfirmDestructive(owner, v)
    playTick(owner)
  }

  function handlePrintFontChange(v: PrintFontSize) {
    setPrintFontSizeState(v)
    setPrintFontSize(owner, v)
    playTick(owner)
    toast.success(`Letra de impresión: ${PRINT_FONT_LABELS[v]}`)
  }

  function adjustPrintCustom(key: keyof PrintSizes, delta: number) {
    const raw = printCustom[key] + delta
    const clamped = Math.min(PRINT_SIZE_MAX, Math.max(PRINT_SIZE_MIN, Math.round(raw * 10) / 10))
    const next: PrintSizes = { ...printCustom, [key]: clamped }
    setPrintCustomState(next)
    setPrintCustomSizes(owner, next)
    if (printFontSize !== 'custom') {
      setPrintFontSizeState('custom')
      setPrintFontSize(owner, 'custom')
    }
  }

  function handleAutoOpenPrintChange(v: boolean) {
    setAutoOpenPrintState(v)
    setAutoOpenPrintDialog(owner, v)
  }

  function handleShowPrintLogoChange(v: boolean) {
    setShowPrintLogoState(v)
    setShowPrintLogo(owner, v)
  }

  /* ─────── OpenAI API Key ─────── */
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null)
  const [apiKeyExists, setApiKeyExists] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [loadingKey, setLoadingKey] = useState(true)

  useEffect(() => {
    async function fetchApiKey() {
      try {
        const res = await fetch('/api/settings?key=openai_api_key')
        if (!res.ok) throw new Error('Error al cargar la clave')
        const data = await res.json()
        setApiKeyExists(data.exists ?? false)
        setApiKeyMasked(data.value ?? null)
      } catch {
        // silently ignore — key just shows as not configured
      } finally {
        setLoadingKey(false)
      }
    }
    fetchApiKey()
  }, [])

  async function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) {
      toast.error('Ingresa una API key válida')
      return
    }
    setSavingKey(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'openai_api_key', value: trimmed }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Error al guardar')
      }
      setApiKeyExists(true)
      setApiKeyMasked(`sk-...${trimmed.slice(-4)}`)
      setApiKeyInput('')
      toast.success('API key guardada correctamente')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(msg)
    } finally {
      setSavingKey(false)
    }
  }

  async function handleTestApiKey() {
    setTestingKey(true)
    try {
      const res = await fetch('/api/ai/parse-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' }),
      })
      const data = await res.json()
      if (!res.ok && data.error?.toLowerCase().includes('api key')) {
        throw new Error(data.error)
      }
      toast.success('Conexión con OpenAI exitosa')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con OpenAI'
      toast.error(msg)
    } finally {
      setTestingKey(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    if (changingPwd) return

    if (!currentPwd || !newPwd || !confirmPwd) {
      toast.error('Completa todos los campos')
      return
    }
    if (newPwd !== confirmPwd) {
      toast.error('La nueva contraseña y su confirmación no coinciden')
      return
    }

    setChangingPwd(true)
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar la contraseña')

      playSuccess(owner)
      toast.success('Contraseña cambiada correctamente')
      setCurrentPwd('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña'
      playError(owner)
      toast.error(msg)
    } finally {
      setChangingPwd(false)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) throw new Error('logout failed')
      router.push('/login')
    } catch (err) {
      console.error(err)
      toast.error('Error al cerrar sesión')
      setLoggingOut(false)
    }
  }

  /* ─────── Wipe cuenta ─────── */
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeText, setWipeText] = useState('')
  const [wiping, setWiping] = useState(false)

  /* ─────── Changelog ─────── */
  const [changelogOpen, setChangelogOpen] = useState(false)

  async function handleWipeAccount() {
    if (wipeText.trim() !== 'Acepto') {
      playError(owner)
      toast.error('Debes escribir exactamente "Acepto" para confirmar')
      return
    }
    setWiping(true)
    try {
      const res = await fetch('/api/account/wipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: wipeText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar datos')

      clearAllPreferences(owner)
      emitPrefsChanged()

      playSuccess(owner)
      toast.success('Datos eliminados. La cuenta quedó como nueva.')
      setWipeOpen(false)
      setWipeText('')
      setTimeout(() => router.push('/dashboard'), 800)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar'
      toast.error(msg)
    } finally {
      setWiping(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 mobile-nav-padding">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4 shadow-sm">
        <div className="mx-auto max-w-xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
            <p className="text-xs text-gray-500">{config.name}</p>
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-purple-50 hover:border-purple-300 hover:text-purple-700"
            title="¿Qué hace esta pantalla?"
            aria-label="Ayuda de Configuración"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Ayuda</span>
          </button>
        </div>
      </div>
      {helpOpen && <PageHelpModal content={SETTINGS_HELP} onClose={() => setHelpOpen(false)} />}

      <div className="mx-auto max-w-xl px-4 py-4 space-y-4">
        {/* Perfil */}
        <Section icon={<User className="h-4 w-4" />} title="Perfil">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #f59e0b)' }}
            >
              {(owner?.[0] ?? 'P').toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 capitalize">{owner || 'Paola'}</p>
              <p className="text-sm text-gray-500">{roleLabel(role)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{config.name}</p>
            </div>
          </div>
        </Section>

        {/* Apariencia */}
        <Section icon={<Palette className="h-4 w-4" />} title="Apariencia">
          <div className="space-y-5">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">Tema</p>
                {themeMode === 'system' && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                    Siguiendo tu dispositivo: {resolvedSystemLabel()}
                  </span>
                )}
              </div>
              <p className="mb-2 text-xs text-gray-500">
                Modo oscuro protege tus ojos de noche. &quot;Sistema&quot; sigue el ajuste del celular/computador.
              </p>
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
                {([
                  { value: 'light' as ThemeMode, label: 'Claro', icon: <Sun className="h-4 w-4" /> },
                  { value: 'dark' as ThemeMode, label: 'Oscuro', icon: <Moon className="h-4 w-4" /> },
                  { value: 'system' as ThemeMode, label: 'Sistema', icon: <Monitor className="h-4 w-4" /> },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleThemeChange(opt.value)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all',
                      themeMode === opt.value
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <OptionRow<UiFontSize>
              label="Tamaño de letra"
              description="Aumenta el texto para leer más fácil."
              value={uiFontSize}
              onChange={handleUiFontChange}
              options={[
                { value: 'small', label: 'S' },
                { value: 'medium', label: 'M' },
                { value: 'large', label: 'L' },
                { value: 'xlarge', label: 'XL' },
              ]}
            />

            <OptionRow<UiDensity>
              label="Densidad"
              description="Compacta muestra más información en pantalla."
              value={uiDensity}
              onChange={handleDensityChange}
              options={[
                { value: 'comfortable', label: 'Cómoda', icon: <LayoutGrid className="h-4 w-4" /> },
                { value: 'compact', label: 'Compacta', icon: <LayoutGrid className="h-4 w-4" /> },
              ]}
            />

            <ToggleRow
              label="Reducir animaciones"
              description="Minimiza transiciones y efectos para mayor comodidad visual."
              checked={reduceMotion}
              onChange={handleReduceMotionChange}
            />
          </div>
        </Section>

        {/* Preferencias de la aplicación */}
        <Section icon={<Sparkles className="h-4 w-4" />} title="Preferencias generales">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-gray-500" />
                Formato de moneda
              </p>
              <div className="flex flex-col gap-1 rounded-xl bg-gray-100 p-1">
                {(Object.keys(CURRENCY_LABELS) as CurrencyFormat[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleCurrencyChange(v)}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm font-medium text-left transition-all',
                      currencyFormat === v
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-800',
                    )}
                  >
                    {CURRENCY_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              label="Sonidos de confirmación"
              description="Pequeños beeps al guardar o completar acciones."
              checked={soundsEnabled}
              onChange={handleSoundsChange}
            />

            <ToggleRow
              label="Confirmar antes de borrar"
              description="Pide confirmación antes de eliminar pedidos, productos o inventario."
              checked={confirmDestructive}
              onChange={handleConfirmDestructiveChange}
            />
          </div>
        </Section>

        {/* Cambiar contraseña */}
        <Section icon={<Lock className="h-4 w-4" />} title="Cambiar contraseña">
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Contraseña actual
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                placeholder="••••••••"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Nueva contraseña
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                placeholder="••••••••"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Confirmar contraseña
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                placeholder="••••••••"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={changingPwd}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: '#7c3aed' }}
            >
              {changingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
              {changingPwd ? 'Cambiando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </Section>

        {/* API de IA — config del negocio; no aplica al superadmin (no opera un negocio) */}
        {role !== 'superadmin' && (
        <Section icon={<Cpu className="h-4 w-4" />} title="API de IA">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-medium text-gray-900">OpenAI API Key</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Requerida para el asistente de pedidos con IA
              </p>
            </div>
            {loadingKey ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : apiKeyExists ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Configurada
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                <XCircle className="h-3.5 w-3.5" />
                No configurada
              </span>
            )}
          </div>

          {apiKeyExists && apiKeyMasked && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 font-mono">
              <Key className="h-3.5 w-3.5 shrink-0" />
              {apiKeyMasked}
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                {apiKeyExists ? 'Reemplazar API key' : 'Pegar API key'}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"
                  placeholder="sk-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex min-w-[44px] min-h-[44px] items-center justify-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  aria-label={showApiKey ? 'Ocultar API key' : 'Mostrar API key'}
                >
                  {showApiKey
                    ? <EyeOff className="h-4 w-4" />
                    : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveApiKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50',
                )}
                style={{ background: '#7c3aed' }}
              >
                {savingKey
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Key className="h-4 w-4" />}
                Guardar
              </button>

              <button
                type="button"
                onClick={handleTestApiKey}
                disabled={testingKey || (!apiKeyExists && !apiKeyInput.trim())}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-purple-200 py-2.5 text-sm font-semibold text-purple-700 transition-colors hover:bg-purple-50 disabled:opacity-50',
                )}
              >
                {testingKey
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Zap className="h-4 w-4" />}
                Probar conexión
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-400">
            La clave se almacena de forma segura. Solo se muestran los últimos 4 caracteres.
          </p>
        </Section>
        )}

        {/* Importar datos — operativo; solo quienes operan el negocio (no admin/superadmin) */}
        {!isAdministrativeRole(role) && (
        <Section icon={<Zap className="h-4 w-4" />} title="Importar datos">
          <p className="text-xs text-gray-500 mb-3">
            Sube un archivo Excel (.xlsx) con pedidos, inventario o productos. El sistema detecta el tipo automáticamente.
          </p>
          <ExcelImport />
        </Section>
        )}

        {/* Preferencias de impresión — operativo (despacho); solo quienes operan */}
        {!isAdministrativeRole(role) && (
        <Section icon={<Printer className="h-4 w-4" />} title="Preferencias de impresión">
          <div className="space-y-5">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-900">Tamaño de letra en guía</p>
              <p className="mb-2 text-xs text-gray-500">
                Elige un preajuste o arma tu propio tamaño para que todo quepa en la cinta térmica.
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 sm:grid-cols-4">
                {(['small', 'medium', 'large', 'custom'] as PrintFontSize[]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handlePrintFontChange(size)}
                    className={cn(
                      'rounded-lg py-2 text-xs font-semibold transition-all',
                      printFontSize === size
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    {PRINT_FONT_LABELS[size]}
                  </button>
                ))}
              </div>
            </div>

            {/* Ajuste fino — siempre visible, activa modo personalizado al tocarlo */}
            <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3">
              <p className="mb-2 text-xs font-semibold text-purple-900">
                Ajuste fino (pt) — tocar cualquier control activa el modo Personalizado
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['header', 'body', 'bold', 'footer'] as const).map((k) => (
                  <PrintSizeStepper
                    key={k}
                    label={
                      k === 'header' ? 'Cabecera' :
                      k === 'body' ? 'Cuerpo' :
                      k === 'bold' ? 'Destacado' : 'Pie'
                    }
                    value={printCustom[k]}
                    onDec={() => adjustPrintCustom(k, -0.5)}
                    onInc={() => adjustPrintCustom(k, 0.5)}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Rango permitido: {PRINT_SIZE_MIN}–{PRINT_SIZE_MAX} pt · paso 0.5 pt.
              </p>
            </div>

            {/* Preview */}
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">Vista previa de la guía</p>
              <div className="flex justify-center overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100 p-4">
                <GuideCard
                  sizes={printFontSize === 'custom' ? printCustom : undefined}
                  fontSize={printFontSize === 'custom' ? undefined : printFontSize}
                  order={{
                    order_code: 'TM-0001',
                    client_name: 'Paola Rodríguez',
                    phone: '3203880422',
                    address: 'Calle 123 #45-67',
                    complement: 'Apto 301 · Bogotá',
                    product_ref: 'P12',
                    detail: '2 pares pantuflas · negro · talla 37',
                    value_to_collect: 85000,
                    comment: 'Llamar antes de entregar',
                  }}
                />
              </div>
            </div>

            <ToggleRow
              label="Abrir diálogo de impresión automáticamente"
              description="Al abrir una guía, abre directo el diálogo del sistema."
              checked={autoOpenPrint}
              onChange={handleAutoOpenPrintChange}
            />

            <ToggleRow
              label="Mostrar logo en guías"
              description="Incluye el logo del negocio en la cabecera de cada guía."
              checked={showPrintLogo}
              onChange={handleShowPrintLogoChange}
            />

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <ImageIcon className="h-3.5 w-3.5" />
                Impresora recomendada
              </p>
              <p className="mt-1 text-xs text-gray-500">
                XP-56C térmica 58mm. Configurar márgenes en 0mm y tamaño de papel en 58mm.
              </p>
            </div>
          </div>
        </Section>
        )}

        {/* Negocio — el superadmin no es un negocio */}
        {role !== 'superadmin' && (
        <Section icon={<Store className="h-4 w-4" />} title="Negocio">
          <dl className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sm text-gray-500">Nombre del negocio</dt>
              <dd className="text-sm font-semibold text-gray-900">{config.name}</dd>
            </div>
            {config.phone && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-sm text-gray-500 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Teléfono de contacto
                </dt>
                <dd className="text-sm font-semibold text-gray-900">{config.phone}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sm text-gray-500">Productos</dt>
              <dd className="text-sm font-semibold text-gray-900">{config.categories.join(' · ')}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-400">
            Para modificar datos del negocio, contacta al administrador.
          </p>
        </Section>
        )}

        {/* Zona peligrosa — borra datos del negocio; no aplica al superadmin */}
        {role !== 'superadmin' && (
        <Section
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Zona peligrosa"
          tone="red"
        >
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Eliminar todos los datos de la cuenta
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Borra pedidos, inventario, productos, gastos y preferencias.
                La cuenta queda como nueva. Esta acción es <b>irreversible</b>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWipeOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Eliminar todos los datos
            </button>
          </div>
        </Section>
        )}

        {/* Acerca de */}
        <Section icon={<Info className="h-4 w-4" />} title="Acerca de">
          <dl className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sm text-gray-500">Versión</dt>
              <dd>
                <button
                  type="button"
                  onClick={() => setChangelogOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-sm font-mono font-semibold text-purple-700 transition-colors hover:bg-purple-100"
                  title="Ver qué trajo cada versión"
                  aria-label="Ver historial de versiones"
                >
                  {APP_VERSION}
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-sm text-gray-500">Creada por</dt>
              <dd className="text-sm font-semibold text-gray-900">Ronald · Koptup</dd>
            </div>
            <p className="pt-1 text-xs text-gray-400">
              Toca la versión para ver qué mejoró en cada entrega.
            </p>
          </dl>

          <div className="mt-4 space-y-2 rounded-xl border border-purple-100 bg-purple-50/40 p-3">
            <p className="text-xs font-semibold text-gray-700">¿Necesitas ayuda o tienes ideas?</p>
            <a
              href="https://wa.me/573024794842?text=Hola%20Ronald%2C%20te%20escribo%20por%20la%20app%20Meraki"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-700"
            >
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              <span className="font-medium">+57 302 479 4842</span>
              <span className="ml-auto text-xs text-gray-400">WhatsApp</span>
            </a>
            <a
              href="https://koptup.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-purple-50 hover:text-purple-700"
            >
              <Globe className="h-4 w-4 text-purple-500" />
              <span className="font-medium">koptup.com</span>
              <span className="ml-auto text-xs text-gray-400">Sitio web</span>
            </a>
          </div>
        </Section>

        {/* Cerrar sesión */}
        <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(
              'flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-red-50 disabled:opacity-60',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <LogOut className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold text-red-600">
                  {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
                </p>
                <p className="text-xs text-gray-400">Salir de la cuenta</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </button>
        </div>
      </div>

      {/* Modal: historial de versiones (changelog) */}
      {changelogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          onClick={() => setChangelogOpen(false)}
        >
          <div
            className="flex w-full max-w-lg max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-gray-100 bg-purple-50 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white">
                <Info className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-gray-900">Historial de versiones</h3>
                <p className="text-xs text-gray-500">Qué trajo cada entrega de Meraki</p>
              </div>
              <button
                type="button"
                onClick={() => setChangelogOpen(false)}
                className="flex min-w-[44px] min-h-[44px] items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-600"
                aria-label="Cerrar"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ol className="space-y-5">
                {CHANGELOG.map((entry, idx) => (
                  <li key={entry.version} className="relative pl-5">
                    <span
                      className={cn(
                        'absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2',
                        idx === 0
                          ? 'border-purple-600 bg-purple-500'
                          : 'border-gray-300 bg-white',
                      )}
                    />
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-bold text-gray-900">
                        v{entry.version}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                          Actual
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{entry.date}</span>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {entry.highlights.map((h, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-sm text-gray-700 leading-snug"
                        >
                          <span className="text-purple-500 shrink-0">•</span>
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              <p className="mt-6 rounded-xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                Cada entrega sube la versión en 0.001. La lista se actualiza con cada despliegue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar borrado total */}
      {wipeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-100 bg-red-50 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500 text-white">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Eliminar todos los datos</h3>
                <p className="text-xs text-gray-500">Esta acción no se puede deshacer</p>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-gray-700">
                Se eliminarán <b>todos</b> los pedidos, inventario, productos, gastos
                y tus preferencias. La cuenta quedará como nueva.
              </p>
              <p className="text-sm text-gray-700">
                Para confirmar, escribe exactamente <b>Acepto</b> en el campo de abajo:
              </p>
              <input
                type="text"
                value={wipeText}
                onChange={(e) => setWipeText(e.target.value)}
                placeholder="Escribe: Acepto"
                autoFocus
                spellCheck={false}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setWipeOpen(false)
                  setWipeText('')
                }}
                disabled={wiping}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleWipeAccount}
                disabled={wiping || wipeText.trim() !== 'Acepto'}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {wiping
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />}
                Eliminar datos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
