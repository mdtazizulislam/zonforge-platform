import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import AuthCard from '../components/auth/AuthCard'
import { resolveApiBaseUrl } from '@/lib/runtime-config'

type SignupResponse = Record<string, unknown>

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
      'Unable to create account. Please check your details.'
    throw new Error(String(message))
  }

  return data as T
}

export default function SignupPage() {
  const navigate = useNavigate()
  const apiBase = useMemo(resolveApiBaseUrl, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  function validate(): string | null {
    if (!email.trim()) return 'Work email is required.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirmPassword) return 'Passwords do not match.'
    return null
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const validationError = validate()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    setSubmitting(true)

    try {
      await postJson<SignupResponse>(`${apiBase}/v1/auth/register`, {
        email: email.trim(),
        password,
      })

      setSuccessMessage('Account created successfully. Redirecting to sign in...')
      window.setTimeout(() => {
        navigate('/login', { replace: true })
      }, 900)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Start with a secure workspace from day one."
      subtitle="Create your ZonForge account to begin monitoring identity, cloud, and early threat signals through a single security workspace."
    >
      <AuthCard
        heading="Create your ZonForge workspace"
        description="Register a production-ready account and continue into your security environment."
      >
        <form className="zf-auth-form" onSubmit={handleSubmit} noValidate>
          <div className="zf-field">
            <label htmlFor="signup-email">Work Email</label>
            <input
              id="signup-email"
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
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <div className="zf-helper">Use at least 8 characters for a production-safe password baseline.</div>
          </div>

          <div className="zf-field">
            <label htmlFor="signup-confirm-password">Confirm Password</label>
            <input
              id="signup-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          {errorMessage ? <div className="zf-form-error">{errorMessage}</div> : null}
          {successMessage ? <div className="zf-form-success">{successMessage}</div> : null}

          <button className="zf-auth-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="zf-auth-footer">
          Already have an account?{' '}
          <Link className="zf-auth-link" to="/login">
            Sign in
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  )
}