/**
 * components/SqlPanel.tsx
 * Collapsible panel showing generated SQL — restyled per UI.md.
 * Monospace font kept for actual SQL content (correct per UI.md).
 * All logic (handleCopy, isOpen state) preserved verbatim.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface SqlPanelProps {
  sql: string
}

export default function SqlPanel({ sql }: SqlPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-3">
      <button
        id="sql-panel-toggle"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300
                   transition-colors group"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-3.5 h-3.5 text-emerald-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span>{isOpen ? 'Hide SQL' : 'Show SQL'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 relative group">
              <pre className="code-block text-xs leading-relaxed whitespace-pre-wrap">
                <code>{sql}</code>
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                           bg-surface-800 hover:bg-surface-700 border border-white/[0.10]
                           text-slate-400 hover:text-white text-xs px-2 py-1 rounded-md"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
