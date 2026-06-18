'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberDevice, setRememberDevice] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  async function doLogin() {
    if (!username.trim() || !password.trim()) {
      toast.error('Por favor completa todos los campos')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Usuario o contraseña incorrectos')
      }

      toast.success('Bienvenido/a, ' + username + '!')
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  function handleForgotPassword() {
    toast('Comunícate con soporte para restablecer tu contraseña 💬', {
      icon: 'ℹ️',
      duration: 4000,
    })
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{
        background: 'linear-gradient(135deg, #7c3aed 0%, #9061f9 50%, #a78bfa 100%)',
      }}
    >
      {/* Decorative circles */}
      <div
        aria-hidden
        className="pointer-events-none fixed top-[-80px] left-[-80px] w-72 h-72 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-[-60px] right-[-60px] w-64 h-64 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-sm animate-slideUp">
        {/* Card */}
        <div
          className="rounded-3xl shadow-2xl overflow-hidden"
          style={{ background: '#fff' }}
        >
          {/* Brand header */}
          <div
            className="px-8 pt-10 pb-8 text-center"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
            }}
          >
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg"
              style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
            >
              <span className="text-5xl select-none" role="img" aria-label="tienda">
                🏪
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Meraki
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Gestión de pedidos y catálogo
            </p>
          </div>

          {/* Form */}
          <form onSubmit={(e) => e.preventDefault()} className="px-8 py-8 space-y-5">
            {/* Username */}
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-sm font-semibold"
                style={{ color: '#374151' }}
              >
                Usuario
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                placeholder="Tu nombre de usuario"
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all duration-200 disabled:opacity-60"
                style={{
                  borderColor: '#e2e8f0',
                  color: '#1e293b',
                  background: '#f8fafc',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#7c3aed'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)'
                  e.currentTarget.style.background = '#fff'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.background = '#f8fafc'
                }}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-semibold"
                style={{ color: '#374151' }}
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } }}
                  disabled={loading}
                  placeholder="••••••••"
                  className="w-full rounded-xl border px-4 py-3 pr-11 text-sm outline-none transition-all duration-200 disabled:opacity-60"
                  style={{
                    borderColor: '#e2e8f0',
                    color: '#1e293b',
                    background: '#f8fafc',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#7c3aed'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.12)'
                    e.currentTarget.style.background = '#fff'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = '#f8fafc'
                  }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors"
                  style={{ color: '#94a3b8' }}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember device */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  disabled={loading}
                />
                <div
                  className="w-10 h-6 rounded-full transition-colors duration-200 peer-checked:opacity-100"
                  style={{
                    background: rememberDevice ? '#7c3aed' : '#e2e8f0',
                  }}
                />
                <div
                  className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                  style={{
                    transform: rememberDevice ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </div>
              <span className="text-sm" style={{ color: '#475569' }}>
                Recordar dispositivo
              </span>
            </label>

            {/* Inline error (persiste hasta el próximo intento) */}
            {error && (
              <p role="alert" className="rounded-xl px-3 py-2 text-sm font-medium"
                style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
                {error}
              </p>
            )}

            {/* Login button */}
            <button
              type="button"
              onClick={doLogin}
              disabled={loading}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? '#9061f9'
                  : 'linear-gradient(135deg, #7c3aed 0%, #9061f9 100%)',
                boxShadow: loading ? 'none' : '0 4px 15px rgba(124,58,237,0.4)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,58,237,0.5)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(124,58,237,0.4)'
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Ingresando...
                </span>
              ) : (
                'Ingresar'
              )}
            </button>

            {/* Forgot password */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm transition-colors duration-150"
                style={{ color: '#7c3aed' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#5b21b6')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#7c3aed')}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </form>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Plataforma de gestión de pedidos y catálogo
        </p>
      </div>
    </main>
  )
}
