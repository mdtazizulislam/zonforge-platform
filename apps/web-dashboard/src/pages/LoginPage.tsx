import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, tokenStorage, type LoginResult } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Spinner } from '@/components/ui'

export function LoginPage() {
  const navigate = useNavigate()
  const setUser  = useAuthStore(s => s.setUser)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [totp,     setTotp]     = useState('')
  const [needsMfa, setNeedsMfa] = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await api.auth.login(email, password, needsMfa ? totp : undefined)

      if (result.requiresMfa) {
        setNeedsMfa(true)
        setLoading(false)
        return
      }

      tokenStorage.set(result.accessToken)
      tokenStorage.setRefresh(result.refreshToken)
      if (!result.user) {
        throw new Error('Login succeeded but no user profile was returned')
      }
      setUser(result.user)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)]
                      bg-[size:4rem_4rem] opacity-30 pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center mb-4 shadow-lg shadow-brand-600/30">
            <span className="text-white text-xl font-bold">Z</span>
          </div>
          <h1 className="text-xl font-bold text-gray-100">ZonForge Sentinel</h1>
          <p className="text-sm text-gray-500 mt-1">AI-Powered Cyber Early Warning</p>
        </div>

        {/* Card */}
        <div className="card p-6 shadow-2xl shadow-black/50">
          <h2 className="text-sm font-semibold text-gray-300 mb-5">
            {needsMfa ? 'Two-Factor Authentication' : 'Sign in to your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!needsMfa ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    required
                    className="input"
                    placeholder="analyst@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    className="input"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Authenticator code
                </label>
                <input
                  type="text"
                  required
                  className="input font-mono text-center tracking-[0.25em] text-lg"
                  placeholder="000 000"
                  value={totp}
                  onChange={e => setTotp(e.target.value.replace(/\s/g, ''))}
                  maxLength={6}
                  autoFocus
                  inputMode="numeric"
                />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? <Spinner size="sm" /> : null}
              {needsMfa ? 'Verify' : 'Sign In'}
            </button>

            {needsMfa && (
              <button
                type="button"
                onClick={() => { setNeedsMfa(false); setTotp('') }}
                className="btn-ghost w-full justify-center text-gray-500"
              >
                ← Back to login
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Protected by ZonForge Sentinel v4.6.0
        </p>
      </div>
    </div>
  )
}

export default LoginPage
