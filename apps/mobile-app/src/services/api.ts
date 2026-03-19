/**
 * ZonForge Sentinel Mobile — API Client
 * Connects to the same backend as web dashboard
 */

import * as SecureStore from 'expo-secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.zonforge.com'

// ── Token management ──────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('zf_access_token')
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('zf_access_token', token)
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync('zf_access_token')
}

// ── Base fetch ────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401) {
    await clearToken()
    throw new Error('UNAUTHORIZED')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────

export const auth = {
  login: (email: string, password: string) =>
    apiFetch<{ data: { accessToken: string; user: any } }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch<{ data: any }>('/v1/auth/me'),

  logout: () => apiFetch('/v1/auth/logout', { method: 'POST' }),
}

// ── Alerts ────────────────────────────────────────────────────────

export const alerts = {
  list: (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams(params as any).toString()
    return apiFetch<{ data: any[]; meta: any }>(`/v1/alerts${q ? '?' + q : ''}`)
  },

  get: (id: string) =>
    apiFetch<{ data: any }>(`/v1/alerts/${id}`),

  resolve: (id: string) =>
    apiFetch(`/v1/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }),

  markFalsePositive: (id: string) =>
    apiFetch(`/v1/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'false_positive' }) }),
}

// ── Risk ──────────────────────────────────────────────────────────

export const risk = {
  posture: () => apiFetch<{ data: any }>('/v1/risk/posture'),
  users:   () => apiFetch<{ data: any[] }>('/v1/risk/users?limit=10'),
}

// ── AI Triage ─────────────────────────────────────────────────────

export const triage = {
  queue: () => apiFetch<{ data: any[] }>('/v1/triage/queue?limit=20'),
  score: (alertId: string) => apiFetch<{ data: any }>(`/v1/triage/${alertId}`),
}

// ── Investigations (AI SOC) ───────────────────────────────────────

export const investigations = {
  list: () => apiFetch<{ data: any[] }>('/v1/investigations?limit=20'),
  get:  (id: string) => apiFetch<{ data: any }>(`/v1/investigations/${id}`),
  run:  (alertId: string) =>
    apiFetch('/v1/investigations', { method: 'POST', body: JSON.stringify({ alertId }) }),
}

// ── Security Assistant Chat ───────────────────────────────────────

export const assistant = {
  chat: (messages: any[], sessionId?: string) =>
    apiFetch<{ data: { message: string; toolsUsed: string[]; sessionId: string } }>(
      '/v1/assistant/chat',
      { method: 'POST', body: JSON.stringify({ messages, sessionId }) }
    ),
  suggestions: () => apiFetch<{ data: string[] }>('/v1/assistant/suggestions'),
}

// ── Connectors ────────────────────────────────────────────────────

export const connectors = {
  list: () => apiFetch<{ data: any[] }>('/v1/connectors'),
}
