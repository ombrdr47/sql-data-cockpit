/**
 * pages/Settings.tsx
 * User profile, password management, and Groq API key configuration.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../lib/auth'
import api from '../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyStatus {
  has_key: boolean
  masked: string | null
}

interface FormMessage {
  type: 'success' | 'error'
  text: string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ hasKey }: { hasKey: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
        hasKey
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${hasKey ? 'bg-emerald-400' : 'bg-amber-400'}`}
      />
      {hasKey ? 'Connected' : 'Not configured'}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, logout } = useAuth()

  // ── Password state ─────────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [pwdMessage, setPwdMessage] = useState<FormMessage | null>(null)
  const [pwdLoading, setPwdLoading] = useState(false)

  // ── API key state ──────────────────────────────────────────────────────────
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyMessage, setKeyMessage] = useState<FormMessage | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  // ── Load API key status on mount ───────────────────────────────────────────
  const fetchKeyStatus = useCallback(async () => {
    try {
      const res = await api.get<ApiKeyStatus>('/settings/api-key')
      setKeyStatus(res.data)
    } catch {
      setKeyStatus({ has_key: false, masked: null })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchKeyStatus()
  }, [fetchKeyStatus])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMessage(null)
    if (newPassword !== confirmNewPassword) {
      setPwdMessage({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPwdMessage({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }
    setPwdLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setPwdMessage({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err: unknown) {
      const detail =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined
      setPwdMessage({ type: 'error', text: detail ?? 'Failed to update password.' })
    } finally {
      setPwdLoading(false)
    }
  }

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setKeyMessage(null)
    const trimmed = keyInput.trim()
    if (!trimmed) {
      setKeyMessage({ type: 'error', text: 'Please enter your Groq API key.' })
      return
    }
    setKeyLoading(true)
    try {
      const res = await api.put<ApiKeyStatus>('/settings/api-key', { api_key: trimmed })
      setKeyStatus(res.data)
      setKeyInput('')
      setKeyMessage({ type: 'success', text: 'API key saved and verified.' })
    } catch (err: unknown) {
      const detail =
        typeof err === 'object' && err !== null && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined
      setKeyMessage({ type: 'error', text: detail ?? 'Failed to save API key.' })
    } finally {
      setKeyLoading(false)
    }
  }

  const handleRemoveKey = async () => {
    setKeyLoading(true)
    setKeyMessage(null)
    try {
      await api.delete('/settings/api-key')
      setKeyStatus({ has_key: false, masked: null })
      setShowRemoveConfirm(false)
      setKeyMessage({ type: 'success', text: 'API key removed.' })
    } catch {
      setKeyMessage({ type: 'error', text: 'Failed to remove API key.' })
    } finally {
      setKeyLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-950 py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto space-y-5"
      >
        {/* Back link */}
        <Link
          to="/chat"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to console
        </Link>

        <h1 className="text-2xl font-bold text-white">Settings</h1>

        {/* ── Account card ─────────────────────────────────────────────────── */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Account</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-500/20 border border-accent-500/30 rounded-full
                            flex items-center justify-center text-lg font-bold text-accent-300 flex-shrink-0">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">{user?.username}</p>
              <p className="text-slate-400 text-sm">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* ── Groq API Key card ─────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-300">Groq API Key</h2>
            {keyStatus !== null && <StatusBadge hasKey={keyStatus.has_key} />}
          </div>
          <p className="text-xs text-slate-500 mb-5">
            SQL Cockpit uses your own{' '}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-400 hover:text-accent-300 underline underline-offset-2 transition-colors"
            >
              Groq API key
            </a>{' '}
            to run queries. Your key is encrypted at rest and never shared.
          </p>

          <AnimatePresence mode="wait">
            {keyStatus?.has_key ? (
              /* Key is saved — show masked key + remove option */
              <motion.div
                key="has-key"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-900 border border-surface-700 rounded-xl">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" className="text-accent-400 flex-shrink-0">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <code className="text-sm text-slate-300 font-mono tracking-wider flex-1">
                    {keyStatus.masked}
                  </code>
                </div>

                {!showRemoveConfirm ? (
                  <button
                    onClick={() => setShowRemoveConfirm(true)}
                    className="text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove key
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3"
                  >
                    <span className="text-sm text-slate-400">Remove this key?</span>
                    <button
                      onClick={handleRemoveKey}
                      disabled={keyLoading}
                      className="text-sm text-red-400 hover:text-red-300 transition-colors font-medium"
                    >
                      {keyLoading ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      onClick={() => setShowRemoveConfirm(false)}
                      className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              /* No key — show input form */
              <motion.form
                key="no-key"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                onSubmit={handleSaveKey}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    API Key
                  </label>
                  <input
                    id="groq-api-key-input"
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="input-field font-mono"
                    placeholder="gsk_••••••••••••••••••••••••••••••••"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <button
                  type="submit"
                  disabled={keyLoading || !keyInput.trim()}
                  className="btn-primary px-6 py-2.5"
                >
                  {keyLoading ? 'Verifying…' : 'Save & verify'}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Key message */}
          <AnimatePresence>
            {keyMessage && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`mt-4 text-sm px-4 py-3 rounded-xl border ${
                  keyMessage.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                }`}
              >
                {keyMessage.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Change password card ───────────────────────────────────────────── */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-5">Change password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>

            {pwdMessage && (
              <div className={`text-sm px-4 py-3 rounded-xl border ${
                pwdMessage.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {pwdMessage.text}
              </div>
            )}

            <button type="submit" disabled={pwdLoading} className="btn-primary px-6 py-2.5">
              {pwdLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>

        {/* ── Danger zone ───────────────────────────────────────────────────── */}
        <div className="card p-6 border-red-500/10">
          <h2 className="text-sm font-semibold text-red-400 mb-4">Sign out</h2>
          <button onClick={logout} className="btn-danger">
            Sign out of all sessions
          </button>
        </div>
      </motion.div>
    </div>
  )
}
