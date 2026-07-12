/**
 * components/AgentProgress.tsx
 * Expandable live agent reasoning timeline.
 *
 * Renders a ChatGPT-like "thinking" accordion that shows each node
 * the agent visited in real-time, with its rich detail string.
 * Collapses automatically when the final answer is ready.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface ReasoningStep {
  node: string
  detail: string
  timestamp: number
}

interface AgentProgressProps {
  steps: ReasoningStep[]
  isStreaming: boolean      // true while the agent is still running
}

const NODE_COLORS: Record<string, string> = {
  table_selector:   'text-sky-400',
  generate_sql:     'text-violet-400',
  validate_sql:     'text-amber-400',
  execute_sql:      'text-emerald-400',
  decide_next_step: 'text-rose-400',
  python_tool:      'text-orange-400',
  synthesize_answer:'text-brand-400',
  increment_retry:  'text-red-400',
}

const NODE_DOT_COLORS: Record<string, string> = {
  table_selector:   'bg-sky-500',
  generate_sql:     'bg-violet-500',
  validate_sql:     'bg-amber-500',
  execute_sql:      'bg-emerald-500',
  decide_next_step: 'bg-rose-500',
  python_tool:      'bg-orange-500',
  synthesize_answer:'bg-brand-500',
  increment_retry:  'bg-red-500',
}

export default function AgentProgress({ steps, isStreaming }: AgentProgressProps) {
  const [isOpen, setIsOpen] = useState(true)

  // Keep open by default — do NOT auto-collapse so users can always
  // review agent thinking steps after the response is complete.

  if (steps.length === 0) return null

  return (
    <div className="mt-2 mb-3">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300
                   transition-colors group w-full text-left"
      >
        {/* Animated spinner while running, checkmark when done */}
        {isStreaming ? (
          <span className="w-3.5 h-3.5 border-2 border-brand-500/40 border-t-brand-400
                           rounded-full animate-spin flex-shrink-0" />
        ) : (
          <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none"
               viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className="font-medium">
          {isStreaming
            ? 'Agent is thinking...'
            : `Completed in ${steps.length} steps · ${isOpen ? 'click to collapse' : 'click to expand'}`}
        </span>
        <svg
          className={`w-3 h-3 ml-auto transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable timeline */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-1 border-l-2 border-slate-700/50 ml-1.5">
              {steps.map((step, idx) => {
                const isLast = idx === steps.length - 1
                const dotColor = NODE_DOT_COLORS[step.node] || 'bg-slate-500'
                const textColor = NODE_COLORS[step.node] || 'text-slate-400'

                return (
                  <motion.div
                    key={`${step.node}-${idx}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: 0.05 * idx }}
                    className="relative flex items-start gap-3 pb-3 pl-4"
                  >
                    {/* Timeline dot */}
                    <span
                      className={`
                        absolute left-[-5px] top-1.5 w-2 h-2 rounded-full flex-shrink-0
                        ${dotColor}
                        ${isLast && isStreaming ? 'animate-pulse' : ''}
                      `}
                    />

                    {/* Step detail */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed ${textColor} font-mono`}>
                        {step.detail}
                      </p>
                    </div>
                  </motion.div>
                )
              })}

              {/* Animated cursor at end while streaming */}
              {isStreaming && (
                <div className="relative flex items-center gap-3 pl-4">
                  <span className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-brand-400 animate-ping" />
                  <span className="text-xs text-slate-500 italic font-mono">processing...</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
