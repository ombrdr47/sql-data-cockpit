import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import AuthLayout from '../components/AuthLayout'
import api from '../lib/api'
import { authError } from '../lib/authError'
import { useAuth } from '../lib/auth'

type Mode = 'verify' | 'forgot' | 'reset'
export default function AccountRecovery({ mode }: { mode: Mode }) {
  const [params] = useSearchParams()
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const { logout } = useAuth()
  useEffect(() => {
    // Keep the token only in component memory, out of the address bar and history.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  const title = mode === 'forgot' ? 'Let’s get you back in.' : mode === 'reset' ? 'Choose a new password.' : 'Verify your email.'
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    if (mode === 'reset' && password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      if (mode === 'reset') {
        const { data } = await api.post('/auth/reset-password', { token, password })
        await logout().catch(() => { /* Reset already revoked server-side sessions. */ })
        setMessage(data.message); setDone(true); setPassword(''); setConfirm('')
      } else if (mode === 'verify' && token) {
        const { data } = await api.post('/auth/verify-email', { token })
        setMessage(data.message); setDone(true)
      } else {
        const { data } = await api.post(mode === 'forgot' ? '/auth/forgot-password' : '/auth/resend-verification', { email })
        setMessage(data.message)
      }
    } catch (err) { setError(authError(err, 'We couldn’t complete this request. Please try again.')) }
    finally { setBusy(false) }
  }
  return <AuthLayout>
    <span className="account-eyebrow">{mode === 'verify' ? 'CONFIRM YOUR EMAIL' : 'ACCOUNT RECOVERY'}</span>
    <h2>{title}</h2>
    <p className="account-subtitle">{mode === 'verify' ? token ? 'Confirm below to verify this email address. You can then sign in to your workspace.' : 'Check your inbox for a verification link. Need a new one? Enter your account email below.' : mode === 'forgot' ? 'Enter your account email. If it’s eligible, we’ll send a single-use link that expires in 30 minutes.' : 'Use at least 8 characters. After resetting, sign in again on each device.'}</p>
    {error && <p className="account-error" role="alert">{error}</p>}
    {message && <div className="account-notice" role="status"><CheckCircle2 size={18} /><p>{message}</p></div>}
    {done ? <Link to="/login" className="account-submit">Go to sign in <ArrowRight size={16} /></Link> : mode === 'reset' && !token ? <p className="account-error">This page needs the link from your reset email. <Link to="/forgot-password">Request a new link.</Link></p> : <form onSubmit={submit} className="account-form">
      {mode === 'reset' ? <><label htmlFor="reset-password">New password<input id="reset-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><label htmlFor="reset-confirm">Confirm password<input id="reset-confirm" type="password" required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label></> : !token && <label htmlFor="recovery-email">Email<input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>}
      <button className="account-submit" disabled={busy}>{busy ? <><Loader2 size={16} className="animate-spin" />Please wait…</> : mode === 'reset' ? 'Reset password' : mode === 'verify' && token ? 'Verify email' : mode === 'verify' ? 'Send verification email' : 'Send reset link'}</button>
    </form>}
    {!done && token && <p className="account-switch"><Link to={mode === 'reset' ? '/forgot-password' : '/verify-email'} onClick={() => { if (mode === 'verify') window.location.assign('/verify-email') }}>Request a new link</Link></p>}
    <p className="account-switch"><Link to="/login">Back to sign in</Link></p>
  </AuthLayout>
}
