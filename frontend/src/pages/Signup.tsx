import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { authError } from '../lib/authError'
import AuthLayout from '../components/AuthLayout'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { signup } = useAuth()
  const navigate = useNavigate()
  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setIsLoading(true)
    try { await signup(email, username, password); navigate('/verify-email?email=' + encodeURIComponent(email)) }
    catch (err) { setError(authError(err, 'Registration failed. Please try again.')) }
    finally { setIsLoading(false) }
  }
  return <AuthLayout signup>
    <span className="account-eyebrow">A FRESH WORKSPACE</span>
    <h2>Make room for your next idea.</h2>
    <p className="account-subtitle">Create your account, verify your email, then add your Groq API key to start exploring.</p>
    {error && <p className="account-error" role="alert">{error}</p>}
    <form onSubmit={handleSubmit} className="account-form">
      <label htmlFor="signup-email">Email<input id="signup-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label htmlFor="signup-username">Username<input id="signup-username" required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your name" /></label>
      <label htmlFor="signup-password">Password<span className="account-password"><input id="signup-password" type={showPw ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /><button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onClick={() => setShowPw(v => !v)}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      <label htmlFor="signup-confirm-password">Confirm password<span className="account-password"><input id="signup-confirm-password" type={showConfirm ? 'text' : 'password'} required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat your password" /><button type="button" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirm} onClick={() => setShowConfirm(v => !v)}>{showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
      <button id="signup-submit-btn" className="account-submit" disabled={isLoading}>{isLoading ? <><Loader2 size={17} className="animate-spin" />Creating account…</> : <>Create account <ArrowRight size={17} /></>}</button>
    </form>
    <p className="account-switch">Already have an account? <Link to="/login">Sign in</Link></p>
  </AuthLayout>
}
