import React, { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AuthShell from '@/components/auth/AuthShell'
import AuthCard from '@/components/auth/AuthCard'
import { ApiError, api, tokenStorage } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

function mapInviteError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'invite_not_found') return 'This invitation is invalid.'
    if (error.code === 'invite_not_active' || error.code === 'invite_expired') return 'This invitation is no longer active.'
    if (error.code === 'workspace_membership_conflict') return 'This email already belongs to another workspace.'
    if (error.code === 'invite_email_mismatch') return 'The signed-in account does not match this invitation.'
    if (error.code === 'password_required') return 'Enter your password to confirm this invitation.'
    return error.message
  }

  return 'Unable to accept this invitation right now.'
}

export default function InviteAcceptPage() {
  const navigate = useNavigate()
  const setUser = useAuthStore((state) => state.setUser)
  const authUser = useAuthStore((state) => state.user)
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [fullName, setFullName] = useState(authUser?.fullName ?? authUser?.name ?? '')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const inviteQuery = useQuery({
    queryKey: ['auth', 'invite-preview', token],
    queryFn: () => api.auth.invitePreview(token),
    enabled: Boolean(token),
    retry: false,
  })

  const invite = inviteQuery.data
  const signedInMatchesInvite = useMemo(() => {
    if (!invite || !authUser?.email) return false
    return authUser.email.toLowerCase() === invite.email.toLowerCase()
  }, [authUser?.email, invite])

  const requiresPassword = Boolean(invite?.existingUser && !signedInMatchesInvite)
  const requiresFullName = Boolean(invite && !invite.existingUser && !signedInMatchesInvite)

  const acceptMutation = useMutation({
    mutationFn: () => api.auth.acceptInvite({
      token,
      fullName: requiresFullName ? fullName.trim() : undefined,
      password: requiresPassword || requiresFullName ? password : undefined,
    }),
    onSuccess: (result) => {
      tokenStorage.set(result.accessToken)
      tokenStorage.setRefresh(result.refreshToken)
      setUser(result.user)
      navigate(result.redirectUrl || '/customer-dashboard', { replace: true })
    },
    onError: (error) => {
      setErrorMessage(mapInviteError(error))
    },
  })

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    if (!invite || invite.status !== 'pending') {
      return
    }

    if (requiresFullName && fullName.trim().length < 2) {
      setErrorMessage('Full name must be at least 2 characters.')
      return
    }

    if ((requiresPassword || requiresFullName) && password.length < 10) {
      setErrorMessage('Password must be at least 10 characters.')
      return
    }

    acceptMutation.mutate()
  }

  return (
    <AuthShell
      title="Join your ZonForge workspace securely."
      subtitle="Accept the invitation, confirm your identity, and land directly inside the customer workspace with the right tenant-scoped role."
    >
      <AuthCard
        heading="Accept team invitation"
        description="Use the invitation details below to securely join the workspace."
      >
        {!token ? (
          <div className="zf-form-error">This invite link is missing a token.</div>
        ) : inviteQuery.isLoading ? (
          <p>Loading invitation details...</p>
        ) : inviteQuery.error ? (
          <div className="zf-form-error">{mapInviteError(inviteQuery.error)}</div>
        ) : invite ? (
          <>
            <div className="zf-auth-form">
              <div className="zf-field">
                <label htmlFor="invite-workspace">Workspace</label>
                <input id="invite-workspace" type="text" value={invite.tenant.name} readOnly />
              </div>

              <div className="zf-field">
                <label htmlFor="invite-email">Email</label>
                <input id="invite-email" type="text" value={invite.email} readOnly />
              </div>

              <div className="zf-field">
                <label htmlFor="invite-role">Role</label>
                <input id="invite-role" type="text" value={invite.role} readOnly />
              </div>

              {invite.inviter ? (
                <div className="zf-helper">
                  Invited by {invite.inviter.fullName} ({invite.inviter.email})
                </div>
              ) : null}
            </div>

            {invite.status !== 'pending' ? (
              <div className="zf-form-error">This invitation is {invite.status}.</div>
            ) : (
              <form className="zf-auth-form" onSubmit={handleSubmit} noValidate>
                {requiresFullName ? (
                  <div className="zf-field">
                    <label htmlFor="invite-full-name">Full name</label>
                    <input
                      id="invite-full-name"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="Jane Doe"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                    />
                  </div>
                ) : null}

                {requiresPassword || requiresFullName ? (
                  <div className="zf-field">
                    <label htmlFor="invite-password">Password</label>
                    <input
                      id="invite-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder={requiresFullName ? 'Create a password' : 'Confirm your password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <div className="zf-helper">
                      {requiresFullName
                        ? 'Use at least 10 characters with one letter and one number.'
                        : 'Confirm the password for the invited email address.'}
                    </div>
                  </div>
                ) : null}

                {authUser?.email && !signedInMatchesInvite ? (
                  <div className="zf-helper">
                    Signed in as {authUser.email}. This invite belongs to {invite.email}. Use the invited account credentials or sign out first.
                  </div>
                ) : null}

                {errorMessage ? <div className="zf-form-error">{errorMessage}</div> : null}

                <button className="zf-auth-primary" type="submit" disabled={acceptMutation.isPending}>
                  {acceptMutation.isPending ? 'Accepting invitation...' : 'Accept invitation'}
                </button>
              </form>
            )}
          </>
        ) : null}

        <div className="zf-auth-footer">
          Need to sign in instead?{' '}
          <Link className="zf-auth-link" to="/login">
            Open login
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  )
}