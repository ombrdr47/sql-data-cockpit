/**
 * components/ApprovalCard.tsx
 * Human-In-The-Loop (HITL) review card — restyled per UI.md.
 * All logic (handleApprove, handleReject, onReview, states) preserved verbatim.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'

export interface ApprovalCardProps {
  sql: string
  conversationId: string
  question: string
  status?: 'pending' | 'approved' | 'rejected'
  onReview: (approved: boolean, feedback?: string) => void
  disabled?: boolean
}

export default function ApprovalCard({
  sql,
  status = 'pending',
  onReview,
  disabled = false,
}: ApprovalCardProps) {
  const [feedback, setFeedback]               = useState('')
  const [showFeedbackInput, setShowFeedbackInput] = useState(false)
  const [submitting, setSubmitting]           = useState(false)

  const handleApprove = () => {
    if (disabled || submitting) return
    setSubmitting(true)
    onReview(true)
  }

  const handleReject = () => {
    if (disabled || submitting) return
    setSubmitting(true)
    onReview(false, feedback.trim() || undefined)
  }

  if (status === 'approved') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-3 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl
                   text-sm text-emerald-400 flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block flex-shrink-0" />
        Query approved and executed.
      </motion.div>
    )
  }

  if (status === 'rejected') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl
                   text-sm text-rose-400 flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-rose-400 inline-block flex-shrink-0" />
        Query rejected — the agent will try a revised approach.
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="mt-4 border border-amber-500/30 bg-surface-900 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-amber-300 font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block flex-shrink-0" />
          Review before running
        </div>
        <span className="text-xs text-amber-400/60">read-only query</span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-400">
          The agent generated the following SQL. Approve to run it, or reject to let the agent revise.
        </p>

        {/* SQL preview */}
        <div className="bg-surface-950 border border-white/[0.06] rounded-lg p-3
                        font-mono text-xs text-slate-200 overflow-x-auto">
          <pre className="whitespace-pre-wrap break-all">{sql}</pre>
        </div>

        {/* Optional feedback for rejection */}
        {showFeedbackInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-1.5"
          >
            <label className="text-xs text-slate-400 block">
              Feedback for the agent (optional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Add ORDER BY Total DESC LIMIT 10…"
              disabled={disabled || submitting}
              rows={2}
              className="w-full bg-surface-950 border border-white/[0.10] focus:border-amber-400/60
                         rounded-lg p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none
                         resize-none transition-colors"
            />
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {!showFeedbackInput && (
            <button
              type="button"
              onClick={() => setShowFeedbackInput(true)}
              disabled={disabled || submitting}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1.5"
            >
              Add feedback
            </button>
          )}

          <button
            type="button"
            onClick={handleReject}
            disabled={disabled || submitting}
            className="px-4 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10
                       hover:bg-rose-500/20 text-rose-300 text-sm font-medium
                       transition-all disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Processing…' : 'Reject & revise'}
          </button>

          <button
            type="button"
            onClick={handleApprove}
            disabled={disabled || submitting}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500
                       text-white text-sm font-medium transition-all
                       disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {submitting ? 'Processing…' : 'Run query'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
