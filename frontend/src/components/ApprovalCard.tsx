/**
 * components/ApprovalCard.tsx
 * Human-In-The-Loop (HITL) review card rendered inside an assistant message bubble
 * when execution is interrupted awaiting human confirmation of generated SQL.
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
  const [feedback, setFeedback] = useState('')
  const [showFeedbackInput, setShowFeedbackInput] = useState(false)
  const [submitting, setSubmitting] = useState(false)

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
        className="mt-3 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded font-mono text-xs text-emerald-300 flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
        <span className="font-bold">[HITL_APPROVED]</span>
        <span className="text-emerald-400/80">SQL execution authorized by user.</span>
      </motion.div>
    )
  }

  if (status === 'rejected') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-3 p-3 bg-rose-950/40 border border-rose-500/30 rounded font-mono text-xs text-rose-300 flex items-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
        <span className="font-bold">[HITL_REJECTED]</span>
        <span className="text-rose-400/80">SQL execution intercepted and sent for self-correction.</span>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="mt-4 border border-amber-500/50 bg-surface-900/90 rounded-md overflow-hidden shadow-xl"
    >
      {/* Header */}
      <div className="bg-amber-950/60 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs text-amber-300 font-bold">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
          <span>/// HUMAN_REVIEW_REQUIRED : CHECKPOINT_PAUSED</span>
        </div>
        <span className="text-[10px] font-mono text-amber-400/70 uppercase tracking-wider">
          READ_ONLY_ROLE
        </span>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-300 font-sans">
          The autonomous agent generated the following SQL query. Please verify and approve before execution against the production database:
        </p>

        {/* SQL preview block */}
        <div className="bg-surface-950 border border-slate-800 rounded p-3 font-mono text-xs text-slate-200 overflow-x-auto">
          <pre className="whitespace-pre-wrap break-all">{sql}</pre>
        </div>

        {/* Feedback Input (optional for rejection) */}
        {showFeedbackInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-1.5"
          >
            <label className="text-[11px] font-mono text-slate-400 block">
              CORRECTION / FEEDBACK FOR AGENT (OPTIONAL):
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Add ORDER BY Total DESC LIMIT 10..."
              disabled={disabled || submitting}
              rows={2}
              className="w-full bg-surface-950 border border-slate-700 focus:border-amber-500 rounded p-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none"
            />
          </motion.div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {!showFeedbackInput && (
            <button
              type="button"
              onClick={() => setShowFeedbackInput(true)}
              disabled={disabled || submitting}
              className="btn-ghost text-xs px-3 py-1.5 font-mono text-slate-400 hover:text-slate-200"
            >
              [+ ADD CORRECTION NOTES]
            </button>
          )}

          <button
            type="button"
            onClick={handleReject}
            disabled={disabled || submitting}
            className="px-3.5 py-1.5 rounded border border-rose-500/60 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 font-mono text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
          >
            {submitting ? '[PROCESSING...]' : '[ REJECT & SELF-CORRECT ]'}
          </button>

          <button
            type="button"
            onClick={handleApprove}
            disabled={disabled || submitting}
            className="px-4 py-1.5 rounded border border-emerald-500/70 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 font-mono text-xs font-bold transition-all shadow-lg disabled:opacity-50 cursor-pointer"
          >
            {submitting ? '[PROCESSING...]' : '[ APPROVE & EXECUTE ]'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
