/**
 * pages/Signup.tsx
 * Split-panel registration — dark left panel + elevated right form.
 * All auth logic preserved verbatim.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'

const BENEFITS = [
  'Natural language → validated SQL in seconds',
  'Human approval checkpoint before execution',
  'Interactive tables and auto-generated charts',
  'Connect your own PostgreSQL database',
]

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
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex">

      {/* ── Left panel (hidden on mobile) ────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-1/2 relative flex-col
                      bg-surface-950 overflow-hidden">
        <div className="absolute inset-0 bg-mesh pointer-events-none" aria-hidden />
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full
                        bg-violet-600/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[300px] h-[300px] rounded-full
                        bg-accent-600/8 blur-[80px] pointer-events-none" />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-accent flex items-center justify-center shadow-glow-sm">
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-semibold text-white">SQL Cockpit</span>
          </Link>

          {/* Headline */}
          <div className="my-auto">
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
              Your database,<br />
              <span className="text-gradient">in plain English.</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm mb-10">
              Create a free account and start querying with natural language in under a minute.
            </p>

            {/* Benefits */}
            <div className="space-y-3.5">
              {BENEFITS.map((b) => (
                <div key={b} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-accent-500/20 border border-accent-500/30
                                  flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-sm text-slate-300">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom note */}
          <div className="border-t border-white/[0.08] pt-6 mt-10">
            <p className="text-xs text-slate-500">
              Free forever for the Chinook demo database. Connect your own DB anytime.
            </p>
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
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-neutral-900 tracking-tight mb-1">
                Create an account
              </h1>
              <p className="text-sm text-neutral-500">
                Free forever · No credit card needed.
              </p>
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
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Email</label>
                <input
                  id="signup-email"
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
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">Username</label>
                <input
                  id="signup-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_name"
                  autoComplete="username"
                  className="input-field-light"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Password</label>
                  <input
                    id="signup-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    className="input-field-light"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">Confirm</label>
                  <input
                    id="signup-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="input-field-light"
                  />
                </div>
              </div>

              <button
                id="signup-submit-btn"
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
                    Creating account…
                  </>
                ) : (
                  'Create free account'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-neutral-500">
              Already have an account?{' '}
              <Link to="/login" className="text-accent-600 hover:text-accent-500 font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
