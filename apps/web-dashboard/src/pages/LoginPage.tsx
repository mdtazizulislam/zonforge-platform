import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import AuthCard from '../components/auth/AuthCard'
import { api, tokenStorage } from '@/lib/api'
import { resolvePostLoginRedirect } from '@/lib/auth-routing'
import { useAuthStore } from '@/stores/auth.store'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setUser = useAuthStore((state) => state.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const requestedPath = typeof location.state === 'object'
    && location.state
    && 'from' in location.state
    && typeof location.state.from === 'object'
    && location.state.from
    && 'pathname' in location.state.from
    && typeof location.state.from.pathname === 'string'
    ? location.state.from.pathname
    : null

  const safeRequestedPath = requestedPath
    && requestedPath.startsWith('/')
    && !['/login', '/signup', '/invite/accept'].includes(requestedPath)
    ? requestedPath
    : null

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage('')

    try {
      const result = await api.auth.login(email.trim(), password)

      if (result.requiresMfa) {
        throw new Error('Multi-factor authentication is required for this account.')
      }

      if (!result.accessToken || !result.refreshToken || !result.user) {
        throw new Error('Unable to establish a customer session.')
      }

      tokenStorage.set(result.accessToken)
      tokenStorage.setRefresh(result.refreshToken)
      setUser(result.user)

      navigate(resolvePostLoginRedirect({
        requestedPath: safeRequestedPath,
        subject: result.user,
      }), { replace: true })
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

          <div className="zf-helper">
            Sign in with your workspace email and password. Team members join through secure email invites from a workspace owner or admin.
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
