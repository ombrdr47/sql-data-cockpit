/**
 * pages/Signup.tsx — Light theme auth, matching Landing.tsx aesthetic.
 * Centred card layout. Auth logic unchanged.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const INK    = '#111214'
const MUTED  = '#5B6270'
const BORDER = '#e5e7eb'
const CANVAS = '#FAFAF9'

export default function Signup() {
  const [email, setEmail]                     = useState('')
  const [username, setUsername]               = useState('')
  const [password, setPassword]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError]                     = useState('')
  const [isLoading, setIsLoading]             = useState(false)
  const { signup } = useAuth()
  const navigate   = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setIsLoading(true)
    try {
      await signup(email, username, password)
      navigate('/chat')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <style>{`
        .auth-input {
          width: 100%;
          border: 1px solid ${BORDER};
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          color: ${INK};
          background: #fff;
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .auth-input::placeholder { color: #a8a29e; }
        .auth-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .signup-grid-bg {
          background-color: ${CANVAS};
          background-image:
            linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>

      <div
        className="signup-grid-bg min-h-screen flex flex-col items-center justify-center px-4 py-12 font-sans"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 mb-8">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: INK }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-semibold text-sm" style={{ color: INK }}>SQL Cockpit</span>
        </Link>

        {/* Card */}
        <div
          className="w-full max-w-[400px] rounded-2xl p-7 sm:p-8"
          style={{ backgroundColor: '#fff', border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)' }}
        >
          <div className="mb-6">
            <h1 className="text-xl font-bold mb-1" style={{ color: INK }}>Create an account</h1>
            <p className="text-sm" style={{ color: MUTED }}>
              Free to start · The Chinook demo database is included.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-4 px-3.5 py-3 rounded-xl text-sm flex items-start gap-2"
              style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}
            >
              <svg className="flex-shrink-0 mt-0.5" width="14" height="14"
                viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="auth-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                Username
              </label>
              <input
                id="signup-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your_name"
                autoComplete="username"
                className="auth-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                minLength={8}
                className="auth-input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                Confirm password
              </label>
              <input
                id="signup-confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="auth-input"
              />
            </div>

            <button
              id="signup-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 mt-1 transition-colors"
              style={{
                backgroundColor: isLoading ? '#93c5fd' : '#2563eb',
                color: '#fff',
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => !isLoading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseLeave={e => !isLoading && (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              {isLoading ? (
                <>
                  <span
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                  />
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm" style={{ color: MUTED }}>
            Already have an account?{' '}
            <Link to="/login" className="font-semibold" style={{ color: '#2563eb' }}>
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-xs text-center" style={{ color: '#a8a29e' }}>
          Built on LangGraph · Groq · PostgreSQL · sqlglot
        </p>
      </div>
    </>
  )
}
