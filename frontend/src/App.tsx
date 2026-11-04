import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, ProtectedRoute } from './lib/auth'
import Landing from './pages/Landing'
import { lazy, Suspense } from 'react'
import Login from './pages/Login'
import Signup from './pages/Signup'
import AccountRecovery from './pages/AccountRecovery'
import Chat from './pages/Chat'
import Settings from './pages/Settings'

// Keep design previews out of production routes and bundles.
const ReferenceDemo = import.meta.env.DEV ? lazy(() => import('./pages/ReferenceDemo')) : null
const ThemeDemo = import.meta.env.DEV ? lazy(() => import('./pages/ThemeDemo')) : null

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            {ThemeDemo && <Route path="/theme-demo" element={<Suspense fallback={<p>Loading preview…</p>}><ThemeDemo /></Suspense>} />}
            {ReferenceDemo && <Route path="/reference-demo" element={<Suspense fallback={<p>Loading preview…</p>}><ReferenceDemo /></Suspense>} />}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify-email" element={<AccountRecovery key="verify" mode="verify" />} />
            <Route path="/forgot-password" element={<AccountRecovery key="forgot" mode="forgot" />} />
            <Route path="/reset-password" element={<AccountRecovery key="reset" mode="reset" />} />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <Chat />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* Default: redirect to chat (ProtectedRoute handles auth check) */}
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
