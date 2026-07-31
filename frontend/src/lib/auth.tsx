/**
 * lib/auth.tsx
 * Auth context, hooks, and protected route component.
 *
 * Uses attemptTokenRefresh() (no interceptors) for the silent refresh on mount,
 * preventing the interceptor-triggered infinite reload loop.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { setAccessToken, setUnauthenticatedCallback, attemptTokenRefresh } from './api'

export interface User {
  user_id: string
  username: string
  email: string
  role: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  })

  // Register the "unauthenticated" callback so that when the Axios interceptor
  // encounters a 401 it cannot recover from, it updates React state instead of
  // doing a hard window.location redirect (which caused the infinite reload loop).
  useEffect(() => {
    setUnauthenticatedCallback(() => {
      setAccessToken(null)
      setState({ user: null, isLoading: false, isAuthenticated: false })
    })
  }, [])

  // On mount: try to restore session via silent refresh.
  // Uses attemptTokenRefresh() which bypasses the interceptor, so a 401 here
  // does NOT trigger another redirect — it just resolves to null.
  useEffect(() => {
    const init = async () => {
      const newToken = await attemptTokenRefresh()

      if (newToken) {
        setAccessToken(newToken)
        try {
          // Fetch user profile with the new token
          const { data } = await api.get('/auth/me')
          setState({
            user: {
              user_id: data.user_id,
              username: data.username,
              email: data.email,
              role: data.role ?? 'user',
            },
            isLoading: false,
            isAuthenticated: true,
          })
        } catch {
          // Token was valid but /auth/me failed — treat as unauthenticated
          setAccessToken(null)
          setState({ user: null, isLoading: false, isAuthenticated: false })
        }
      } else {
        // No valid refresh cookie — user needs to log in
        setState({ user: null, isLoading: false, isAuthenticated: false })
      }
    }

    init()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    setAccessToken(data.access_token)
    setState({
      user: { user_id: data.user_id, username: data.username, email: data.email, role: 'user' },
      isLoading: false,
      isAuthenticated: true,
    })
  }, [])

  const signup = useCallback(async (email: string, username: string, password: string) => {
    const { data } = await api.post('/auth/signup', { email, username, password })
    setAccessToken(data.access_token)
    setState({
      user: { user_id: data.user_id, username: data.username, email: data.email, role: 'user' },
      isLoading: false,
      isAuthenticated: true,
    })
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setAccessToken(null)
      setState({ user: null, isLoading: false, isAuthenticated: false })
    }
  }, [])

  const refreshUser = useCallback(async () => {
    const { data } = await api.get('/auth/me')
    setState((prev) => ({
      ...prev,
      user: { user_id: data.user_id, username: data.username, email: data.email, role: data.role },
    }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Protected route: redirects to /login if not authenticated. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return <>{children}</>
}
