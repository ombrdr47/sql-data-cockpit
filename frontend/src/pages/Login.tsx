/**
 * pages/Login.tsx — Light theme auth, matching Landing.tsx aesthetic.
 * Left: light brand panel with grid bg, value props, SQL preview.
 * Right: clean white form card. Auth logic unchanged.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const VALUE_PROPS = [
  'Schema-aware table selection — no full-schema prompts',
  'Every query validated by sqlglot before execution',
  'Human approval checkpoint on ambiguous queries',
  'Results as tables or charts, streamed live',
]

const INK   = '#111214'
const MUTED = '#5B6270'
const BORDER = '#e5e7eb'
const CANVAS = '#FAFAF9'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { login }    = useAuth()
  const navigate     = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/chat')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Incorrect email or password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = () => {
    setEmail('demo@chinook.dev')
    setPassword('demo1234')
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
        .auth-grid-bg {
          background-color: ${CANVAS};
          background-image:
            linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
          background-size: 32px 32px;
        }
      `}</style>

      <div className="flex h-screen overflow-hidden font-sans" style={{ backgroundColor: CANVAS }}>

        {/* ── Left brand panel ──────────────────────────────────────────────── */}
        <div
          className="auth-grid-bg hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col justify-between px-12 py-10 flex-shrink-0"
          style={{ borderRight: `1px solid ${BORDER}` }}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
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

          {/* Main copy */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] font-semibold mb-5" style={{ color: MUTED }}>
              What you get
            </p>
            <h2 className="text-2xl font-bold leading-snug mb-8" style={{ color: INK }}>
              Your database,<br />
              in plain English
            </h2>

            <ul className="space-y-4">
              {VALUE_PROPS.map((prop) => (
                <li key={prop} className="flex items-start gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6l2.5 2.5 4.5-5" stroke="#15803d" strokeWidth="1.8"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-sm leading-relaxed" style={{ color: MUTED }}>{prop}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SQL preview strip */}
          <div>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: '#fff' }}
            >
              <div
                className="px-4 py-2.5 text-[10px] font-mono"
                style={{ borderBottom: `1px solid ${BORDER}`, color: '#15803d' }}
              >
                ✓ AST validated · read-only transaction
              </div>
              <pre className="px-4 py-3 text-[10px] font-mono leading-relaxed" style={{ color: INK }}>
{`SELECT customer, SUM(total) AS revenue
FROM   invoices
GROUP  BY customer
ORDER  BY revenue DESC
LIMIT  10`}
              </pre>
            </div>
            <p className="text-xs mt-4" style={{ color: '#a8a29e' }}>
              Built on LangGraph · Groq · PostgreSQL · sqlglot
            </p>
          </div>
        </div>

        {/* ── Right form panel ──────────────────────────────────────────────── */}
        <div
          className="flex-1 flex flex-col items-center justify-center px-5 sm:px-10 overflow-y-auto"
          style={{ backgroundColor: CANVAS }}
        >
          {/* Mobile logo */}
          <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: INK }}>
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-sm" style={{ color: INK }}>SQL Cockpit</span>
          </Link>

          <div className="w-full max-w-[380px]">
            {/* Heading */}
            <div className="mb-7">
              <h1 className="text-xl font-bold mb-1" style={{ color: INK }}>Sign in</h1>
              <p className="text-sm" style={{ color: MUTED }}>
                Welcome back. Enter your credentials to continue.
              </p>
            </div>

            {/* Demo shortcut */}
            <button
              id="demo-btn"
              type="button"
              onClick={fillDemo}
              className="w-full mb-5 flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-left"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = CANVAS)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#fff')}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                style={{ backgroundColor: CANVAS, border: `1px solid ${BORDER}` }}
              >
                ⚡
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight" style={{ color: INK }}>Try the demo</p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>Fills credentials automatically</p>
              </div>
              <svg className="ml-auto flex-shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: MUTED }}>
                <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
              <span className="text-xs whitespace-nowrap" style={{ color: '#a8a29e' }}>or continue with email</span>
              <div className="flex-1 h-px" style={{ backgroundColor: BORDER }} />
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-4 flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
                style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}
              >
                <svg className="flex-shrink-0 mt-0.5" width="14" height="14"
                  viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
                </svg>
                <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: INK }}>
                  Email address
                </label>
                <input
                  id="email-input"
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
                  Password
                </label>
                <input
                  id="password-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="auth-input"
                />
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full mt-1 py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                style={{ backgroundColor: '#2563eb', color: '#fff' }}
                onMouseEnter={e => !loading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
                onMouseLeave={e => !loading && (e.currentTarget.style.backgroundColor = '#2563eb')}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 rounded-full animate-spin"
                      style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                    Signing in…
                  </>
                ) : 'Sign in'}
              </button>
            </form>

            <p className="mt-5 text-center text-sm" style={{ color: MUTED }}>
              Don't have an account?{' '}
              <Link to="/signup" className="font-semibold" style={{ color: '#2563eb' }}>
                Create one free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
