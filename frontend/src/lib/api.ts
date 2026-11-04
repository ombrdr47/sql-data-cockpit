/**
 * lib/api.ts
 * Axios client with:
 * - Access token auto-attach from memory (not localStorage)
 * - 401 → silent refresh → retry original request (ONE retry only)
 * - Refresh failures clear state cleanly without hard page reloads
 *
 * Bug fixed: the previous version called window.location.href = '/login'
 * on every 401, which caused an infinite reload loop because the /auth/refresh
 * call itself returned 401 (no valid cookie) → interceptor triggered another
 * redirect → page reloaded → /auth/refresh called again → infinite loop.
 *
 * Fix: use a separate plain axios instance (no interceptors) for refresh calls,
 * and use a callback-based "on unauthenticated" hook instead of hard redirects.
 */
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// In-memory token store (not localStorage — avoids XSS token theft)
// The refresh token lives in an httpOnly cookie (backend sets it).
let accessToken: string | null = null
let isRefreshing = false
let refreshQueue: Array<(token: string | null) => void> = []

// Callback invoked when refresh definitively fails (no valid session).
// Set by AuthProvider so it can clear React state instead of hard-redirecting.
let onUnauthenticated: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

export function setUnauthenticatedCallback(cb: () => void) {
  onUnauthenticated = cb
}

// ── A plain axios instance with NO interceptors, used ONLY for /auth/refresh ──
// This avoids the interceptor re-triggering on refresh 401s.
const rawAxios = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise: Promise<string | null> | null = null
export function attemptTokenRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = rawAxios.post('/auth/refresh')
      .then(({ data }) => data.access_token ?? null)
      .catch(() => null)
      .finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token ───────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// ── Response interceptor: 401 → refresh → retry (once) ────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Only handle 401, and only retry once per request
    if (!originalRequest || originalRequest.url?.startsWith('/auth/') || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    originalRequest._retry = true

    if (isRefreshing) {
      // Another refresh is already in flight — queue this request
      return new Promise((resolve, reject) => {
        refreshQueue.push((newToken: string | null) => {
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(api(originalRequest))
          } else {
            reject(error)
          }
        })
      })
    }

    isRefreshing = true

    const newToken = await attemptTokenRefresh()

    isRefreshing = false

    if (newToken) {
      setAccessToken(newToken)
      // Flush queued requests with the new token
      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    } else {
      // Refresh definitively failed — clear state via React callback
      // DO NOT use window.location.href (causes infinite reload loops)
      setAccessToken(null)
      refreshQueue.forEach((cb) => cb(null))
      refreshQueue = []

      if (onUnauthenticated) {
        onUnauthenticated()
      }
      return Promise.reject(error)
    }
  }
)

export default api

export interface AnalysisSnapshot {
  succeeded: boolean
  question: string
  connection_id: string | null
  source_name: string
  columns: string[]
  rows: Record<string, unknown>[] | null
  ran_at: string
  answer?: string
  chart?: string | null
}

export interface SavedAnalysis {
  id: string
  name: string
  question: string
  sql: string
  connection_id: string | null
  is_demo: boolean
  source_name: string
  snapshot: AnalysisSnapshot
  created_at: string
  last_run_at: string
}

export const analysesApi = {
  list: (): Promise<SavedAnalysis[]> => api.get('/analyses').then(r => r.data),
  save: (messageId: string, name: string): Promise<SavedAnalysis> =>
    api.post('/analyses', { message_id: messageId, name }).then(r => r.data),
}

// ── BYODB Connections API ──────────────────────────────────────────────────────

export interface UserConnection {
  id: string
  name: string
  host_masked: string
  port: number
  database_masked: string
  status: 'untested' | 'connected' | 'unreachable' | 'auth_failed'
  last_tested_at: string | null
  created_at: string
}

export interface ReferenceFile { name: string; content: string }

export interface ConnectionCreate {
  references?: { files: ReferenceFile[] }
  name: string
  host: string
  port: number
  database: string
  username: string
  password: string
}

export interface ConnectionUpdate {
  name?: string
  password?: string
}

export const connectionsApi = {
  getReferences: (id: string): Promise<{ files: ReferenceFile[] }> => api.get(`/connections/${id}/references`).then(r => r.data),
  saveReferences: (id: string, files: ReferenceFile[]): Promise<{ files: ReferenceFile[] }> => api.put(`/connections/${id}/references`, { files }).then(r => r.data),
  list: (): Promise<UserConnection[]> =>
    api.get('/connections').then((r) => r.data),

  create: (payload: ConnectionCreate): Promise<UserConnection> =>
    api.post('/connections', payload).then((r) => r.data),

  update: (id: string, payload: ConnectionUpdate): Promise<UserConnection> =>
    api.patch(`/connections/${id}`, payload).then((r) => r.data),

  delete: (id: string): Promise<void> =>
    api.delete(`/connections/${id}`).then(() => undefined),

  test: (id: string): Promise<UserConnection> =>
    api.post(`/connections/${id}/test`).then((r) => r.data),
}
