import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { authError } from '../lib/authError'
import api from '../lib/api'
import AuthLayout from '../components/AuthLayout'

export default function Login() {
  const [options, setOptions] = useState({ password_reset_available: false, demo_available: false })
  useEffect(() => {
    let active = true
    api.get('/auth/options').then(({ data }) => { if (active) setOptions(data) }).catch(() => {})
    return () => { active = false }
  }, [])
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(() => searchParams.get('demo') === '1' ? 'demo@chinook.dev' : '')
  const [password, setPassword] = useState(() => searchParams.get('demo') === '1' ? 'demo1234' : '')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try { await login(email, password); navigate('/chat') }
    catch (err) { const message = authError(err, 'Sign in failed. Please try again.'); if (message === 'email_not_verified') navigate('/verify-email?email=' + encodeURIComponent(email)); else setError(message) }
    finally { setLoading(false) }
  }
  return <AuthLayout>
    <span className="account-eyebrow">WELCOME BACK</span>
    <h2>Pick up where you left off.</h2>
    <p className="account-subtitle">Sign in to your questions, data sources, and saved analyses.</p>
    {error && <p className="account-error" role="alert">{error}</p>}
    <form onSubmit={handleSubmit} className="account-form">
      <label htmlFor="login-email">Email<input id="login-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label htmlFor="login-password">Password<span className="account-password"><input id="login-password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" /><button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onClick={() => setShowPw(v => !v)}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      <button id="login-submit-btn" className="account-submit" disabled={loading}>{loading ? <><Loader2 size={17} className="animate-spin" />Signing in…</> : <>Sign in <ArrowRight size={17} /></>}</button>
    </form>
    {options.password_reset_available && <p className="account-switch"><Link to="/forgot-password">Forgot your password?</Link></p>}
    {options.demo_available && <>
    <div className="account-divider"><span>OR EXPLORE FIRST</span></div>
    <button type="button" className="account-demo" disabled={loading} onClick={() => { setEmail('demo@chinook.dev'); setPassword('demo1234'); setError('') }}>Use sample account <ArrowRight size={15} /></button>
    <p className="account-hint">Shared demo with Chinook sample data. Select Sign in after filling the credentials.</p>
    </>}
    <p className="account-switch">New to SQL Cockpit? <Link to="/signup">Create an account</Link></p>
  </AuthLayout>
}
