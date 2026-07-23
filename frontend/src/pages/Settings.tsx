/**
 * pages/Settings.tsx
 * User profile and password management — restyled per UI.md.
 * All logic (handlePasswordChange, logout, API calls) preserved verbatim.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import api from '../lib/api'

export default function Settings() {
  const { user, logout } = useAuth()
  const [currentPassword, setCurrentPassword]   = useState('')
  const [newPassword, setNewPassword]           = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword !== confirmNewPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' })
      return
    }

    setIsLoading(true)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      setMessage({ type: 'success', text: 'Password updated successfully.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.detail || 'Failed to update password.' })
    } finally {
      setIsLoading(false)
    }
  }

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

        {/* Account card */}
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

        {/* Change password card */}
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

            {message && (
              <div className={`text-sm px-4 py-3 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {message.text}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary px-6 py-2.5">
              {isLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Danger zone */}
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
