/**
 * pages/Signup.tsx
 * Clean, plain registration form per UI.md.
 * All logic (handleSubmit, signup, navigate) preserved verbatim.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Signup() {
  const [email, setEmail]                   = useState('')
  const [username, setUsername]             = useState('')
  const [password, setPassword]             = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError]                   = useState('')
  const [isLoading, setIsLoading]           = useState(false)
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
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 bg-accent-500 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-neutral-900 text-lg tracking-tight">SQL Cockpit</span>
        </Link>

        {/* Card */}
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8">

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight mb-1">
              Create an account
            </h1>
            <p className="text-sm text-neutral-500">
              Start querying your databases in plain English.
            </p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl
                            text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
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
                className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-sm
                           text-neutral-900 placeholder-neutral-400 bg-white
                           focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400
                           transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
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
                className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-sm
                           text-neutral-900 placeholder-neutral-400 bg-white
                           focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400
                           transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-sm
                             text-neutral-900 placeholder-neutral-400 bg-white
                             focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400
                             transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
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
                  className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-sm
                             text-neutral-900 placeholder-neutral-400 bg-white
                             focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-400
                             transition-all"
                />
              </div>
            </div>

            <button
              id="signup-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent-500 hover:bg-accent-600 text-white font-semibold
                         py-3 rounded-xl transition-all duration-150 flex items-center
                         justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-sm shadow-accent-500/20 active:scale-[0.98] mt-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating account…</span>
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-neutral-500">
            Already have an account?{' '}
            <Link to="/login" className="text-accent-600 hover:text-accent-700 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
