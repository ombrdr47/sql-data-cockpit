/**
 * pages/Login.tsx
 * Split-panel login — dark left panel + elevated right form.
 * All auth logic preserved verbatim.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'

const TESTIMONIALS = [
  {
    quote: 'I went from writing SQL queries manually for hours to getting answers in seconds.',
    author: 'Data Analyst',
  },
  {
    quote: 'The human approval step means I trust every result — no surprises in production.',
    author: 'Backend Engineer',
  },
]

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login }  = useAuth()
  const navigate   = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      navigate('/chat')
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemo = () => {
    setEmail('demo@chinook.dev')
    setPassword('demo1234')
  }

  return (
    <div className="min-h-dvh flex">

      {/* ── Left panel (hidden on mobile) ────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col
                      bg-surface-950 overflow-hidden">
        {/* Mesh background */}
        <div className="absolute inset-0 bg-mesh pointer-events-none" aria-hidden />
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full
                        bg-accent-600/12 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full
                        bg-violet-600/8 blur-[80px] pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 mb-auto">
            <div className="w-8 h-8 rounded-lg bg-gradient-accent flex items-center justify-center shadow-glow-sm">
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-white">SQL Cockpit</span>
          </Link>

          {/* Headline */}
          <div className="mb-auto pt-16">
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
              Query your database<br />
              <span className="text-gradient">in plain English.</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              The agent handles schema selection, SQL generation, safety validation, and
              visualization — you just ask.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3 mb-10">
            {[
              { icon: '⊙', text: 'Schema-aware table pruning' },
              { icon: '◈', text: 'AST validation + read-only execution' },
              { icon: '◇', text: 'Human approval before any query runs' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <span className="text-accent-400 text-base flex-shrink-0">{f.icon}</span>
                <span className="text-sm text-slate-300">{f.text}</span>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="border-t border-white/[0.08] pt-8">
            <blockquote className="text-sm text-slate-400 italic leading-relaxed mb-3">
              "{TESTIMONIALS[0].quote}"
            </blockquote>
            <p className="text-xs text-slate-500">— {TESTIMONIALS[0].author}</p>
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ───────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center
                      bg-neutral-50 px-5 py-10 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[420px]"
        >
          {/* Mobile logo */}
          <Link to="/" className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-neutral-900">SQL Cockpit</span>
          </Link>

          {/* Card */}
          <div className="bg-white rounded-3xl shadow-glass border border-neutral-100 p-7 sm:p-9">
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight mb-1">
                Welcome back
              </h1>
              <p className="text-sm text-neutral-500">Sign in to your workspace.</p>
            </div>

            {/* Demo shortcut */}
            <button
              type="button"
              onClick={fillDemo}
              id="fill-demo-btn"
              className="w-full mb-6 flex items-center gap-3 px-4 py-3
                         bg-accent-50 border border-accent-200 rounded-2xl
                         text-left group hover:bg-accent-100 transition-colors"
            >
              <span className="text-xl">⚡</span>
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-accent-700">Try the demo</span>
                <span className="text-xs text-accent-500">Fill demo credentials instantly</span>
              </div>
              <span className="text-accent-400 group-hover:translate-x-0.5 transition-transform text-sm">→</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex-1 h-px bg-neutral-200" />
              <span className="text-xs text-neutral-400 font-medium">or sign in with email</span>
              <div className="flex-1 h-px bg-neutral-200" />
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl
                              text-sm text-red-600 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Email
                </label>
                <input
                  id="email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="input-field-light"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
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
                  className="input-field-light"
                />
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-accent-500 to-accent-600
                           hover:from-accent-400 hover:to-accent-500
                           text-white font-semibold py-3.5 rounded-2xl
                           transition-all duration-200 shadow-sm hover:shadow-glow-sm
                           flex items-center justify-center gap-2
                           disabled:opacity-50 disabled:cursor-not-allowed
                           active:scale-[0.98] mt-2 text-sm"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-neutral-500">
              Don't have an account?{' '}
              <Link to="/signup" className="text-accent-600 hover:text-accent-500 font-semibold">
                Sign up free
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
