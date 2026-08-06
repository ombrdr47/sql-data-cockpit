/**
 * components/MessageBubble.tsx
 * Chat message bubble — restyled per UI.md.
 * All types, props, and logic preserved verbatim.
 */
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import SqlPanel from './SqlPanel'
import ChartView from './ChartView'
import DataTable from './DataTable'
import AgentProgress, { type ReasoningStep } from './AgentProgress'
import ApprovalCard from './ApprovalCard'

export interface ApprovalRequest {
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
}

interface MessageBubbleProps {
  message: Message
  onReview?: (messageId: string, approved: boolean, feedback?: string) => void
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  )
}

export default function MessageBubble({ message, onReview }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const steps  = message.reasoningSteps ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}
    >
      {/* Avatar */}
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
        ${isUser
          ? 'bg-accent-500 text-white'
          : 'bg-surface-800 border border-white/[0.10] text-slate-400'
        }`}
      >
        {isUser ? (
          'U'
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
          </svg>
        )}
      </div>

      {/* Bubble */}
      <div className={isUser ? 'message-user' : 'message-assistant'}>
        {message.isStreaming && !message.content && steps.length === 0 ? (
          <TypingIndicator />
        ) : isUser ? (
          <p className="text-sm text-slate-100 whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            {/* Agent reasoning timeline */}
            {steps.length > 0 && (
              <AgentProgress steps={steps} isStreaming={message.isStreaming ?? false} />
            )}

            {/* Streaming / final answer */}
            {(message.content || message.isStreaming) && (
              <div className="prose-chat text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content || ''}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-0.5 h-4 bg-accent-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            )}

            {/* HITL approval card */}
            {message.approvalRequest && (
              <ApprovalCard
                sql={message.approvalRequest.sql}
                conversationId={message.approvalRequest.conversationId}
                question={message.approvalRequest.question}
                status={message.approvalRequest.status || 'pending'}
                onReview={(approved, feedback) => onReview?.(message.id, approved, feedback)}
              />
            )}

            {/* SQL panel — shown when streaming is done */}
            {!message.isStreaming && message.generatedSql && (
              <SqlPanel sql={message.generatedSql} />
            )}

            {/* Data table */}
            {message.tableData && message.tableData.columns.length > 0 && (
              <DataTable
                columns={message.tableData.columns}
                rows={message.tableData.rows}
                totalRows={message.tableData.totalRows}
              />
            )}

            {/* Chart */}
            {message.chartBase64 && (
              <ChartView base64={message.chartBase64} />
            )}

            {/* Retry indicator */}
            {!message.isStreaming && message.retryCount != null && message.retryCount > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-500/60">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                SQL self-corrected {message.retryCount} time{message.retryCount !== 1 ? 's' : ''}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  )
}
