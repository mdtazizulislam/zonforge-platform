import React, { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import AuthCard from '../components/auth/AuthCard'
import { api, tokenStorage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

type LoginResponse =
  | {
      accessToken?: string
      token?: string
      refreshToken?: string
      user?: unknown
    }
  | Record<string, unknown>

function resolveApiBase(): string {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env
  const envBase = env?.VITE_API_BASE_URL || env?.VITE_API_URL || '/api'
  return envBase.replace(/\/$/, '')
}

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const message =
      (data && (data.message || data.error || data.detail)) ||
      'Unable to sign in. Please verify your credentials.'
    throw new Error(String(message))
  }

  return data as T
}

function extractAccessToken(data: LoginResponse): string | null {
  if (typeof data.accessToken === 'string' && data.accessToken) return data.accessToken
  if (typeof data.token === 'string' && data.token) return data.token
  return null
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = useAuthStore((state) => state.setUser)
  const apiBase = useMemo(resolveApiBase, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/customer-dashboard'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage('')

    try {
      const data = await postJson<LoginResponse>(`${apiBase}/v1/auth/login`, {
        email: email.trim(),
        password,
      })

      const accessToken = extractAccessToken(data)
      if (accessToken) {
        tokenStorage.set(accessToken)
      }

      const refreshToken = typeof data.refreshToken === 'string' ? data.refreshToken : null
      if (refreshToken) {
        tokenStorage.setRefresh(refreshToken)
      }

      const currentUser = await api.auth.me()
      setUser(currentUser)

      navigate(from, { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Security visibility that feels immediate."
      subtitle="Sign in to access your ZonForge workspace, review active threats, and move from signal to action without losing context."
    >
      <AuthCard
        heading="Sign in to ZonForge"
        description="Use your workspace credentials to access the production security console."
      >
        <form className="zf-auth-form" onSubmit={handleSubmit} noValidate>
          <div className="zf-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="zf-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {errorMessage ? <div className="zf-form-error">{errorMessage}</div> : null}

          <button className="zf-auth-primary" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="zf-auth-divider">or continue with</div>

          <div className="zf-social-row">
            <button className="zf-social-btn" type="button" disabled>
              Google
            </button>
            <button className="zf-social-btn" type="button" disabled>
              Microsoft
            </button>
          </div>
        </form>

        <div className="zf-auth-footer">
          Don’t have an account?{' '}
          <Link className="zf-auth-link" to="/signup">
            Create one
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
