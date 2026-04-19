import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from '../components/auth/AuthShell'
import AuthCard from '../components/auth/AuthCard'
import { ApiError, api, tokenStorage } from '@/lib/api'
import { resolvePostLoginRedirect } from '@/lib/auth-routing'
import { useAuthStore } from '@/stores/auth.store'

type SignupForm = {
  fullName: string
  workspaceName: string
  email: string
  password: string
}

type FieldErrors = Partial<Record<keyof SignupForm, string>>

const initialForm: SignupForm = {
  fullName: '',
  workspaceName: '',
  email: '',
  password: '',
}

function validateForm(form: SignupForm): FieldErrors {
  const errors: FieldErrors = {}

  if (form.fullName.trim().length < 2) {
    errors.fullName = 'Full name is required.'
  }

  if (form.workspaceName.trim().length < 2) {
    errors.workspaceName = 'Workspace name must be at least 2 characters.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid work email.'
  }

  if (form.password.length < 10) {
    errors.password = 'Password must be at least 10 characters.'
  } else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password = 'Password must include at least one letter and one number.'
  }

  return errors
}

function mapSignupError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'email_exists') {
      return 'An account with this email already exists.'
    }

    if (error.code === 'workspace_conflict') {
      return 'This workspace name is not available. Try another.'
    }

    if (error.status === 429) {
      return 'Too many signup attempts. Please try again shortly.'
    }

    if (error.status >= 500) {
      return 'Unable to create workspace right now. Please try again.'
    }

    return error.message
  }

  return 'Unable to create workspace right now. Please try again.'
}

export default function SignupPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  const [form, setForm] = useState<SignupForm>(initialForm)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function updateField<K extends keyof SignupForm>(key: K, value: SignupForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      if (!current[key]) {
        return current
      }

      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    const nextErrors = validateForm(form)
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)

    try {
      const result = await api.auth.signup({
        fullName: form.fullName.trim(),
        workspaceName: form.workspaceName.trim(),
        email: form.email.trim(),
        password: form.password,
      })

      if (!result.accessToken || !result.refreshToken || !result.user) {
        throw new Error('Unable to establish a customer session.')
      }

      tokenStorage.set(result.accessToken)
      tokenStorage.setRefresh(result.refreshToken)
      setUser(result.user)

      navigate(resolvePostLoginRedirect({
        subject: result.user,
      }), {
        replace: true,
      })
    } catch (error) {
      setErrorMessage(mapSignupError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Stand up a secure customer workspace in one step."
      subtitle="Create your account, claim your workspace, and land directly in the ZonForge customer app with onboarding ready."
    >
      <AuthCard
        heading="Create your ZonForge workspace"
        description="Your first account becomes the workspace owner. You can invite more members later."
      >
        <form className="zf-auth-form" onSubmit={handleSubmit} noValidate>
          <div className="zf-field">
            <label htmlFor="signup-full-name">Full name</label>
            <input
              id="signup-full-name"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="Jane Doe"
              value={form.fullName}
              onChange={(event) => updateField('fullName', event.target.value)}
              required
            />
            {fieldErrors.fullName ? <div className="zf-form-error">{fieldErrors.fullName}</div> : null}
          </div>

          <div className="zf-field">
            <label htmlFor="signup-workspace-name">Workspace name</label>
            <input
              id="signup-workspace-name"
              name="workspaceName"
              type="text"
              autoComplete="organization"
              placeholder="Acme Security"
              value={form.workspaceName}
              onChange={(event) => updateField('workspaceName', event.target.value)}
              required
            />
            {fieldErrors.workspaceName ? <div className="zf-form-error">{fieldErrors.workspaceName}</div> : null}
          </div>

          <div className="zf-field">
            <label htmlFor="signup-email">Work email</label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="owner@company.com"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              required
            />
            {fieldErrors.email ? <div className="zf-form-error">{fieldErrors.email}</div> : null}
          </div>

          <div className="zf-field">
            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Minimum 10 characters"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              required
            />
            <div className="zf-helper">Use at least 10 characters with one letter and one number.</div>
            {fieldErrors.password ? <div className="zf-form-error">{fieldErrors.password}</div> : null}
          </div>

          {errorMessage ? <div className="zf-form-error">{errorMessage}</div> : null}

          <button className="zf-auth-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating workspace...' : 'Create workspace'}
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