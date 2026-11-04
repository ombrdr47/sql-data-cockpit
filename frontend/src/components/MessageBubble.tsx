/**
 * components/MessageBubble.tsx
 * Chat message bubble — refined visual polish.
 * All types, props, and logic preserved verbatim.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SqlPanel from './SqlPanel'
import ChartView from './ChartView'
import DataTable from './DataTable'
import AgentProgress, { type ReasoningStep } from './AgentProgress'
import ApprovalCard from './ApprovalCard'

export interface ApprovalRequest {
  reviewToken?: string
  sql: string
  conversationId: string
  question: string
  status?: 'pending' | 'approved' | 'rejected' | 'processing'
}

export interface TableData {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  generatedSql?: string | null
  chartBase64?: string | null
  tableData?: TableData | null
  retryCount?: number | null
  isStreaming?: boolean
  reasoningSteps?: ReasoningStep[]
  approvalRequest?: ApprovalRequest | null
  error?: boolean
  persistedId?: string
  querySucceeded?: boolean
  ranAt?: string
}

interface MessageBubbleProps {
  message: Message
  onReview?: (messageId: string, approved: boolean, feedback?: string) => void
  onInspect?: (messageId: string) => void
}

/** Wave typing indicator — three dots scaling sequentially */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1 px-1">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-wave-1" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-wave-2" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-wave-3" />
    </div>
  )
}

/** Sparkle icon for the AI avatar */
function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
    </svg>
  )
}

/** Copy-to-clipboard ghost button */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {/* ignore */}
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy response"
      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                 text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]
                 transition-all duration-150 border border-transparent hover:border-white/[0.08]"
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

export default function MessageBubble({ message, onReview, onInspect }: MessageBubbleProps) {
  const [hovered, setHovered] = useState(false)
  const isUser = message.role === 'user'
  const steps  = message.reasoningSteps ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-5`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
        ${isUser
          ? 'text-white'
          : 'bg-surface-800 border border-white/[0.10] text-blue-400'
        }`}
        style={isUser ? { background: 'linear-gradient(135deg, #2563eb, #6366f1)' } : {}}
      >
        {isUser ? 'U' : <SparkleIcon />}
      </div>

      {/* Bubble */}
      <div className={`relative flex flex-col gap-3 ${isUser ? 'items-end' : 'items-start w-full max-w-full md:max-w-4xl'}`}
           onMouseEnter={() => setHovered(true)}
           onMouseLeave={() => setHovered(false)}
      >
        {/* User message */}
        {isUser && (
          <div className="message-user">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        )}

        {/* Assistant message */}
        {!isUser && (
          <div className="relative group w-full">
            {/* Copy button — appears on hover */}
            <div className={`absolute -top-7 right-0 transition-all duration-200 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
              <CopyButton text={message.content} />
            </div>

            <div className="message-assistant">
              {/* Streaming placeholder */}
              {message.isStreaming && !message.content && <TypingIndicator />}

              {/* Reasoning steps */}
              {steps.length > 0 && (
                <div className="mb-3">
                  <AgentProgress steps={steps} isStreaming={message.isStreaming ?? false} />
                </div>
              )}

              {/* HITL approval card */}
              {message.approvalRequest && (
                <div className="mb-3">
                  <ApprovalCard
                    sql={message.approvalRequest.sql}
                    conversationId={message.approvalRequest.conversationId}
                    question={message.approvalRequest.question}
                    status={message.approvalRequest.status}
                    onReview={(approved, feedback) => onReview?.(message.id, approved, feedback)}
                  />
                </div>
              )}

              {/* Main content */}
              {message.content && (
                <div className="prose-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              {/* SQL panel */}
              {!onInspect && message.generatedSql && (
                <div className="mt-3">
                  <SqlPanel sql={message.generatedSql} />
                </div>
              )}

              {/* Chart */}
              {!onInspect && message.chartBase64 && (
                <div className="mt-3">
                  <ChartView base64={message.chartBase64} />
                </div>
              )}

              {/* Data table */}
              {!onInspect && message.tableData && (
                <div className="mt-3">
                  <DataTable
                    columns={message.tableData.columns}
                    rows={message.tableData.rows}
                    totalRows={message.tableData.totalRows}
                  />
                </div>
              )}
              {onInspect && (message.generatedSql || message.tableData || message.chartBase64) && (
                <button className="explore-inspect" onClick={() => onInspect(message.id)}>Inspect results →</button>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
