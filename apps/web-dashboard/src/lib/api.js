// ─────────────────────────────────────────────
// ZonForge API Client
// Typed fetch wrapper with JWT auth + error handling
// ─────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
// ── API error ────────────────────────────────
export class ApiError extends Error {
    code;
    status;
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'ApiError';
    }
}
// ── Auth token storage ────────────────────────
const TOKEN_KEY = 'zf_access_token';
const RTOKEN_KEY = 'zf_refresh_token';
export const tokenStorage = {
    get: () => localStorage.getItem(TOKEN_KEY),
    set: (t) => localStorage.setItem(TOKEN_KEY, t),
    clear: () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(RTOKEN_KEY); },
    getRefresh: () => localStorage.getItem(RTOKEN_KEY),
    setRefresh: (t) => localStorage.setItem(RTOKEN_KEY, t),
};
// ── Core fetch wrapper ────────────────────────
async function apiFetch(path, options = {}) {
    const token = tokenStorage.get();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
    };
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    // Auto-refresh on 401
    if (resp.status === 401 && tokenStorage.getRefresh()) {
        const refreshed = await attemptRefresh();
        if (refreshed) {
            headers['Authorization'] = `Bearer ${tokenStorage.get()}`;
            const retry = await fetch(`${BASE_URL}${path}`, { ...options, headers });
            return handleResponse(retry);
        }
        tokenStorage.clear();
        window.location.href = '/login';
        throw new ApiError('UNAUTHORIZED', 'Session expired', 401);
    }
    return handleResponse(resp);
}
async function handleResponse(resp) {
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json.success) {
        throw new ApiError(json.error?.code ?? 'UNKNOWN_ERROR', json.error?.message ?? `HTTP ${resp.status}`, resp.status);
    }
    return json.data;
}
async function attemptRefresh() {
    const refreshToken = tokenStorage.getRefresh();
    if (!refreshToken)
        return false;
    try {
        const resp = await fetch(`${BASE_URL}/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
        });
        if (!resp.ok)
            return false;
        const data = await resp.json();
        if (!data.success)
            return false;
        tokenStorage.set(data.data.accessToken);
        tokenStorage.setRefresh(data.data.refreshToken);
        return true;
    }
    catch {
        return false;
    }
}
// ─────────────────────────────────────────────
// TYPED API METHODS
// ─────────────────────────────────────────────
export const api = {
    // ── Auth ──────────────────────────────────
    auth: {
        login: (email, password, totpCode) => apiFetch('/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, totpCode }),
        }),
        logout: () => apiFetch('/v1/auth/logout', { method: 'POST' }),
        me: () => apiFetch('/v1/auth/me'),
    },
    // ── Alerts ────────────────────────────────
    alerts: {
        list: (params) => apiFetch(`/v1/alerts?${new URLSearchParams(params ?? {}).toString()}`),
        get: (id) => apiFetch(`/v1/alerts/${id}`),
        updateStatus: (id, status, notes) => apiFetch(`/v1/alerts/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status, notes }),
        }),
        feedback: (id, verdict, notes) => apiFetch(`/v1/alerts/${id}/feedback`, {
            method: 'POST',
            body: JSON.stringify({ verdict, notes }),
        }),
        assign: (id, analystId) => apiFetch(`/v1/alerts/${id}/assign`, {
            method: 'POST',
            body: JSON.stringify({ analystId }),
        }),
    },
    // ── Risk ──────────────────────────────────
    risk: {
        summary: () => apiFetch('/v1/risk/summary'),
        users: (params) => apiFetch(`/v1/risk/users?${new URLSearchParams(params ?? {}).toString()}`),
        userProfile: (userId) => apiFetch(`/v1/risk/users/${userId}`),
        assets: (params) => apiFetch(`/v1/risk/assets?${new URLSearchParams(params ?? {}).toString()}`),
        assetProfile: (assetId) => apiFetch(`/v1/risk/assets/${assetId}`),
        mttd: () => apiFetch('/v1/metrics/mttd'),
        overrideUser: (userId, newScore, justification) => apiFetch(`/v1/risk/users/${userId}/override`, {
            method: 'PATCH',
            body: JSON.stringify({ newScore, justification }),
        }),
    },
    // ── Compliance ────────────────────────────
    compliance: {
        attackCoverage: (gapsOnly) => apiFetch(`/v1/compliance/attack-coverage${gapsOnly ? '?gaps_only=true' : ''}`),
        auditLog: (params) => apiFetch(`/v1/compliance/audit-log?${new URLSearchParams(params ?? {}).toString()}`),
        rules: () => apiFetch('/v1/compliance/rules'),
    },
    // ── Connectors ────────────────────────────
    connectors: {
        list: () => apiFetch('/v1/connectors'),
        create: (body) => apiFetch('/v1/connectors', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
        validate: (id) => apiFetch(`/v1/connectors/${id}/validate`),
        update: (id, updates) => apiFetch(`/v1/connectors/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        }),
    },
    // ── Health ────────────────────────────────
    health: {
        pipeline: () => apiFetch('/v1/health/pipeline'),
    },
    // ── Playbooks ─────────────────────────────
    playbooks: {
        list: () => apiFetch('/v1/playbooks'),
        execute: (id, alertId, notes) => apiFetch(`/v1/playbooks/${id}/execute`, {
            method: 'POST',
            body: JSON.stringify({ alertId, notes }),
        }),
    },
    // ── Billing ───────────────────────────────
    billing: {
        usage: () => apiFetch('/v1/billing/usage'),
        subscription: () => apiFetch('/v1/billing/subscription'),
    },
};
