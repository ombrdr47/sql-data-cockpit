import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../lib/auth'
import api from '../lib/api'

export default function Settings() {
  const { user, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
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
        className="max-w-2xl mx-auto space-y-6"
      >
        <h1 className="text-2xl font-bold text-white">Settings</h1>

        {/* Profile info card */}
        <div className="glass-dark p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Account</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-brand-600/20 border border-brand-500/30 rounded-full flex items-center justify-center text-xl font-bold text-brand-300">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-white font-medium">{user?.username}</p>
                <p className="text-slate-400 text-sm">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Change password card */}
        <div className="glass-dark p-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Change Password</h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Current password</label>
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
              <label className="block text-sm font-medium text-slate-300 mb-1.5">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="Min 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Confirm new password</label>
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
              <div className={`text-sm px-4 py-3 rounded-lg ${
                message.type === 'success'
                  ? 'bg-emerald-900/20 border border-emerald-800/30 text-emerald-400'
                  : 'bg-red-900/20 border border-red-800/30 text-red-400'
              }`}>
                {message.text}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary px-6 py-2.5">
              {isLoading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Danger zone */}
        <div className="glass-dark p-6 border-red-900/20">
          <h2 className="text-sm font-semibold text-red-400 mb-4">Danger Zone</h2>
          <button
            onClick={logout}
            className="btn-danger"
          >
            Sign out of all sessions
          </button>
        </div>
      </motion.div>
    </div>
  )
}
