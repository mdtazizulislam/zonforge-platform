import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CustomerLayout } from '@/components/customer/CustomerLayout'
import { ApiError, api, type TeamInviteCreateResult, type TeamMember, type TeamRole } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

const MANAGE_ROLES = new Set(['owner', 'admin'])
const INCIDENT_ROLES: TeamRole[] = ['admin', 'analyst', 'viewer']

function formatDate(value: string | null): string {
  if (!value) return 'Pending'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Pending'
  }

  return date.toLocaleString()
}

function roleBadge(role: string): string {
  if (role === 'owner') return 'zf-badge zf-badge--danger'
  if (role === 'admin') return 'zf-badge zf-badge--warning'
  if (role === 'analyst') return 'zf-badge zf-badge--caution'
  return 'zf-badge'
}

function canManageTarget(actorRole: string, member: TeamMember): boolean {
  if (member.isCurrentUser || member.role === 'owner') {
    return false
  }

  if (actorRole === 'owner') {
    return true
  }

  if (actorRole === 'admin') {
    return member.role === 'analyst' || member.role === 'viewer'
  }

  return false
}

function assignableRoles(actorRole: string): TeamRole[] {
  if (actorRole === 'owner') {
    return INCIDENT_ROLES
  }

  if (actorRole === 'admin') {
    return ['analyst', 'viewer']
  }

  return []
}

function mapTeamError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  }

  return 'The team action could not be completed.'
}

export default function CustomerSettingsPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const ownerName = user?.name ?? 'Customer Owner'
  const ownerEmail = user?.email ?? 'owner@example.com'
  const ownerRole = user?.role ?? 'viewer'
  const canManageTeam = MANAGE_ROLES.has(ownerRole)
  const roleOptions = assignableRoles(ownerRole)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamRole>(ownerRole === 'admin' ? 'analyst' : 'viewer')
  const [inviteFeedback, setInviteFeedback] = useState<string>('')
  const [inviteResult, setInviteResult] = useState<TeamInviteCreateResult | null>(null)
  const [roleDrafts, setRoleDrafts] = useState<Record<string, TeamRole>>({})

  const membersQuery = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => api.team.members(),
  })

  const invitesQuery = useQuery({
    queryKey: ['team', 'invites'],
    queryFn: () => api.team.invites(),
    enabled: canManageTeam,
  })

  const createInviteMutation = useMutation({
    mutationFn: () => api.team.createInvite({ email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: (result) => {
      setInviteEmail('')
      setInviteResult(result)
      setInviteFeedback(`Invite created for ${result.invite.email}.`)
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
      queryClient.invalidateQueries({ queryKey: ['team', 'invites'] })
    },
    onError: (error) => {
      setInviteFeedback(mapTeamError(error))
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ membershipId, role }: { membershipId: string; role: TeamRole }) => api.team.updateMemberRole(membershipId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) => api.team.removeMember(membershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })

  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: string) => api.team.revokeInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'invites'] })
    },
  })

  const members = membersQuery.data?.items ?? []
  const permissions = membersQuery.data?.permissions
  const invites = invitesQuery.data ?? []
  const pendingInvites = invites.filter((invite) => invite.status === 'pending')
  const adminCount = members.filter((member) => member.role === 'owner' || member.role === 'admin').length

  return (
    <CustomerLayout
      title="Customer Settings"
      subtitle="Workspace profile, security posture, and tenant-scoped team controls in one operational surface."
    >
      <div className="zf-page">
        <div className="zf-container">
          <section className="zf-section">
            <div className="zf-section-head">
              <h1 className="zf-page-title">Settings</h1>
              <p className="zf-page-subtitle">
                Manage your account, security preferences, and enterprise-grade team access controls.
              </p>
            </div>

            <div className="zf-grid zf-grid-2">
              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Profile</h2>
                  <p className="zf-card-subtitle">Basic customer account information.</p>
                </div>

                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Name</span>
                    <span className="zf-value">{ownerName}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Email</span>
                    <span className="zf-value">{ownerEmail}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Role</span>
                    <span className="zf-value">{ownerRole}</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Team permissions</span>
                    <span className="zf-value">{permissions?.canManageTeam ? 'Manage members and invites' : 'Read-only member visibility'}</span>
                  </div>
                </div>
              </article>

              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Security Settings</h2>
                  <p className="zf-card-subtitle">Authentication posture and workspace protection status without dead-end actions.</p>
                </div>

                <div className="zf-detail-list">
                  <div className="zf-detail-row">
                    <span className="zf-label">Sign-in method</span>
                    <span className="zf-value">Workspace email and password</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Invite security</span>
                    <span className="zf-value">Team access is granted through expiring tenant-scoped invites</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Billing authority</span>
                    <span className="zf-value">Owners and admins manage subscription changes</span>
                  </div>
                  <div className="zf-detail-row">
                    <span className="zf-label">Self-service controls</span>
                    <span className="zf-value">Only live controls are shown here. Unsupported MFA or password workflows are intentionally hidden.</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="zf-section">
            <div className="zf-card zf-customer-shell-hero">
              <div className="zf-card-head">
                <h2 className="zf-card-title">Team & Roles</h2>
                <p className="zf-card-subtitle">Tenant-scoped membership, role governance, and secure invitation flow.</p>
              </div>

              <div className="zf-customer-shell-stat-grid">
                <div className="zf-customer-shell-stat">
                  <span className="zf-customer-shell-stat__label">Members</span>
                  <span className="zf-customer-shell-stat__value">{members.length}</span>
                </div>
                <div className="zf-customer-shell-stat">
                  <span className="zf-customer-shell-stat__label">Admins + Owners</span>
                  <span className="zf-customer-shell-stat__value">{adminCount}</span>
                </div>
                <div className="zf-customer-shell-stat">
                  <span className="zf-customer-shell-stat__label">Pending Invites</span>
                  <span className="zf-customer-shell-stat__value">{pendingInvites.length}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="zf-section zf-team-grid">
            {canManageTeam ? (
              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Invite Member</h2>
                  <p className="zf-card-subtitle">Send a secure invite token with an enforced tenant role.</p>
                </div>

                <form
                  className="zf-team-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setInviteFeedback('')
                    setInviteResult(null)

                    if (!inviteEmail.trim()) {
                      setInviteFeedback('Email is required.')
                      return
                    }

                    createInviteMutation.mutate()
                  }}
                >
                  <div className="zf-team-form__row">
                    <label className="zf-team-field">
                      <span>Email</span>
                      <input
                        className="zf-team-input"
                        type="email"
                        value={inviteEmail}
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="analyst@company.com"
                      />
                    </label>

                    <label className="zf-team-field">
                      <span>Role</span>
                      <select
                        className="zf-team-select"
                        value={inviteRole}
                        onChange={(event) => setInviteRole(event.target.value as TeamRole)}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {inviteFeedback ? (
                    <div className={inviteFeedback.startsWith('Invite created') ? 'zf-form-success' : 'zf-form-error'}>
                      {inviteFeedback}
                    </div>
                  ) : null}

                  {inviteResult?.invitationUrl ? (
                    <div className="zf-team-note">
                      <span>Invitation URL</span>
                      <input
                        aria-label="Invitation URL"
                        className="zf-team-input zf-team-input--mono"
                        type="text"
                        value={inviteResult.invitationUrl}
                        readOnly
                      />
                      <small>Email delivery status: {inviteResult.emailStatus}</small>
                    </div>
                  ) : null}

                  <button className="zf-btn-primary" type="submit" disabled={createInviteMutation.isPending}>
                    {createInviteMutation.isPending ? 'Sending invite...' : 'Send invite'}
                  </button>
                </form>
              </article>
            ) : (
              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Role Scope</h2>
                  <p className="zf-card-subtitle">Your current role can view team membership but cannot change workspace access.</p>
                </div>

                <div className="zf-customer-empty">
                  Team administration is limited to owners and admins. Your assigned role remains {ownerRole}.
                </div>
              </article>
            )}

            <article className="zf-card">
              <div className="zf-card-head">
                <h2 className="zf-card-title">Members</h2>
                <p className="zf-card-subtitle">Current workspace members and effective roles.</p>
              </div>

              {membersQuery.isLoading ? (
                <div className="zf-customer-empty">Loading workspace members...</div>
              ) : membersQuery.error ? (
                <div className="zf-form-error">{mapTeamError(membersQuery.error)}</div>
              ) : (
                <div className="zf-table-wrap">
                  <table className="zf-alerts-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Role</th>
                        <th>Joined</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => {
                        const manageable = canManageTeam && canManageTarget(ownerRole, member)
                        const selectedRole = roleDrafts[member.membershipId] ?? (member.role as TeamRole)

                        return (
                          <tr key={member.membershipId}>
                            <td>
                              <div className="zf-alerts-table__title">{member.fullName}</div>
                              <div className="zf-team-muted">{member.email}{member.isCurrentUser ? ' • you' : ''}</div>
                            </td>
                            <td>
                              <span className={roleBadge(member.role)}>{member.role}</span>
                            </td>
                            <td>{formatDate(member.createdAt)}</td>
                            <td>
                              {manageable ? (
                                <div className="zf-team-actions">
                                  <select
                                    aria-label={`Change role for ${member.fullName}`}
                                    className="zf-team-select zf-team-select--compact"
                                    value={selectedRole}
                                    onChange={(event) => setRoleDrafts((current) => ({
                                      ...current,
                                      [member.membershipId]: event.target.value as TeamRole,
                                    }))}
                                  >
                                    {roleOptions.map((role) => (
                                      <option key={role} value={role}>{role}</option>
                                    ))}
                                  </select>

                                  <button
                                    className="zf-btn-secondary"
                                    type="button"
                                    disabled={updateRoleMutation.isPending || selectedRole === member.role}
                                    onClick={() => updateRoleMutation.mutate({
                                      membershipId: member.membershipId,
                                      role: selectedRole,
                                    })}
                                  >
                                    Update
                                  </button>

                                  <button
                                    className="zf-btn-secondary"
                                    type="button"
                                    disabled={removeMemberMutation.isPending}
                                    onClick={() => removeMemberMutation.mutate(member.membershipId)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : (
                                <span className="zf-team-muted">No action available</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>

          {canManageTeam ? (
            <section className="zf-section">
              <article className="zf-card">
                <div className="zf-card-head">
                  <h2 className="zf-card-title">Pending Invitations</h2>
                  <p className="zf-card-subtitle">Track unaccepted tokens and revoke access before acceptance if needed.</p>
                </div>

                {invitesQuery.isLoading ? (
                  <div className="zf-customer-empty">Loading invitations...</div>
                ) : invitesQuery.error ? (
                  <div className="zf-form-error">{mapTeamError(invitesQuery.error)}</div>
                ) : pendingInvites.length === 0 ? (
                  <div className="zf-customer-empty">No active invitations are pending.</div>
                ) : (
                  <div className="zf-table-wrap">
                    <table className="zf-alerts-table">
                      <thead>
                        <tr>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Expires</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingInvites.map((invite) => (
                          <tr key={invite.id}>
                            <td>
                              <div className="zf-alerts-table__title">{invite.email}</div>
                              <div className="zf-team-muted">Invited by {invite.invitedBy?.fullName ?? 'Workspace admin'}</div>
                            </td>
                            <td>
                              <span className={roleBadge(invite.role)}>{invite.role}</span>
                            </td>
                            <td>{formatDate(invite.expiresAt)}</td>
                            <td>
                              <button
                                className="zf-btn-secondary"
                                type="button"
                                disabled={revokeInviteMutation.isPending}
                                onClick={() => revokeInviteMutation.mutate(invite.id)}
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </section>
          ) : null}
        </div>
      </div>
    </CustomerLayout>
  )
}