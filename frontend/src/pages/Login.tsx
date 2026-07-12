/**
 * pages/Login.tsx
 * Obsidian Cyber-Terminal Authentication
 * Authorized security clearance checkpoint for the Chinook SQL Data Cockpit.
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/chat')
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setIsLoading(false)
    }
  }

  const fillDemo = () => {
    setEmail('demo@chinook.dev')
    setPassword('demo1234')
  }

  return (
    <div className="min-h-screen bg-surface-950 text-slate-100 flex flex-col lg:flex-row relative selection:bg-brand-500 selection:text-surface-950 font-sans">
      {/* ── Background Technical Spec Lines ──────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1c1f26_1px,transparent_1px),linear-gradient(to_bottom,#1c1f26_1px,transparent_1px)] bg-[size:32px_32px] opacity-30" />
        <div className="absolute top-[20%] left-[10%] w-[400px] h-[400px] bg-brand-600/5 rounded-full blur-[140px]" />
      </div>

      {/* ── Left Column: System Telemetry Showcase ───────────────────────────── */}
      <div className="lg:w-1/2 p-8 lg:p-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 relative z-10 font-mono">
        <div>
          <Link to="/" className="inline-flex items-center gap-3 group mb-12">
            <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center text-surface-950 font-bold shadow-[0_0_12px_rgba(255,107,0,0.4)]">
              SQL
            </div>
            <span className="text-white font-bold tracking-tight uppercase group-hover:text-brand-400 transition-colors">
              Chinook <span className="text-brand-500">// DATA COCKPIT v2</span>
            </span>
          </Link>

          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-surface-900 border border-slate-800 text-emerald-400 text-[11px] mb-6 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>SEC_CLEARANCE: AUTHORIZED_TERMINAL</span>
            </div>

            <h1 className="text-3xl lg:text-5xl font-bold text-white tracking-tight mb-6 font-sans">
              Precision Data Cockpit Access.
            </h1>

            <p className="text-slate-400 text-xs leading-relaxed mb-10 font-sans">
              Authenticate to connect with the autonomous SQL engineering console. Experience token-pruned schema ingestion, AST syntax verification, and process-isolated sandbox analytics.
            </p>

            {/* Diagnostic checklist */}
            <div className="space-y-3 bg-surface-900/60 p-5 rounded border border-slate-800 text-xs mb-8">
              <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-2">[SYS_INTEGRITY_CHECK]</div>
              <div className="flex items-center justify-between text-slate-300">
                <span>[01] TLS 1.3 Transport Encryption</span>
                <span className="text-emerald-400 font-bold">VERIFIED_OK</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>[02] Process Sandbox Container</span>
                <span className="text-emerald-400 font-bold">ISOLATED_OK</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>[03] AST Compiler Guard</span>
                <span className="text-emerald-400 font-bold">ACTIVE_OK</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-slate-500 text-[11px] flex items-center justify-between pt-6 border-t border-slate-800/60">
          <span>TARGET_DB: chinook_music_store.postgresql</span>
          <span>v2.0.4-prod</span>
        </div>
      </div>

      {/* ── Right Column: Authentication Terminal ────────────────────────────── */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md terminal-panel p-8 lg:p-10 border-slate-800 shadow-2xl relative"
        >
          {/* Corner crosshairs */}
          <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-brand-500" />
          <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-brand-500" />
          <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-brand-500" />
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-brand-500" />

          <div className="mb-8 font-mono">
            <span className="text-[10px] text-brand-500 font-bold uppercase tracking-widest block mb-1">// AUTHENTICATION_REQUIRED</span>
            <h2 className="text-2xl font-bold text-white tracking-tight font-sans">Connect to Workspace</h2>
            <p className="text-slate-400 text-xs mt-1 font-sans">Enter operator credentials to unlock the SQL terminal.</p>
          </div>

          {/* Instant Demo Authorization Badge */}
          <div className="mb-8 bg-brand-950/20 border border-brand-500/30 rounded p-4 flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-brand-400 text-base">⚡</span>
              <div>
                <span className="text-slate-200 font-bold block text-xs">Sandbox Demo Access</span>
                <span className="text-slate-400 text-[11px]">Instant pre-configured clearance</span>
              </div>
            </div>
            <button
              type="button"
              onClick={fillDemo}
              className="bg-brand-500 hover:bg-brand-400 text-surface-950 font-bold px-3 py-1.5 rounded text-[11px] uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(255,107,0,0.3)] active:scale-95"
            >
              [FILL_DEMO]
            </button>
          </div>

          {error && (
            <div className="mb-6 bg-red-950/40 border border-red-800/80 text-red-300 p-3 rounded text-xs font-mono flex items-center gap-2">
              <span className="text-red-400 font-bold">[ERR]</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 font-mono text-xs">
            <div>
              <label className="block text-slate-300 uppercase tracking-wider mb-2">
                [01_EMAIL_ADDRESS]
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@chinook.dev"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-slate-300 uppercase tracking-wider mb-2">
                [02_PASSWORD_KEY]
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input-field"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3.5 text-xs font-bold uppercase tracking-widest mt-2 flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-surface-950 border-t-transparent rounded-full animate-spin" />
                  <span>[AUTHORIZING_SESSION...]</span>
                </>
              ) : (
                <>
                  <span>[AUTHORIZE_COCKPIT_ACCESS]</span>
                  <span>→</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center font-mono text-xs text-slate-400">
            <span>New Operator Clearance? </span>
            <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-bold underline decoration-slate-800 underline-offset-4">
              [REGISTER_TERMINAL]
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
