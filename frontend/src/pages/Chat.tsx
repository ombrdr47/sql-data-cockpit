/**
 * pages/Chat.tsx
 * Main chat interface with SSE streaming, conversation management,
 * and the suggestion chips for new users.
 *
 * Handles new SSE event types:
 *   - type:"reasoning" → appends to reasoningSteps on the assistant message
 *   - type:"table"     → sets tableData on the assistant message
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import MessageBubble, { type Message, type TableData } from '../components/MessageBubble'
import Sidebar from '../components/Sidebar'
import { type ReasoningStep } from '../components/AgentProgress'
import api, { getAccessToken, attemptTokenRefresh, setAccessToken, connectionsApi, type UserConnection } from '../lib/api'
import DatasourcePicker from '../components/DatasourcePicker'
import { useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SUGGESTIONS = [
  { id: 'MACRO_01', label: 'SELECT_TOP_ARTISTS_BY_TRACK_COUNT', prompt: 'Show me the top 5 artists by track count' },
  { id: 'MACRO_02', label: 'ANALYZE_TOP_REVENUE_CUSTOMERS', prompt: 'What are the top 10 customers by total revenue?' },
  { id: 'MACRO_03', label: 'FILTER_GENRES_OVER_100_TRACKS', prompt: 'Which genres have more than 100 tracks?' },
  { id: 'MACRO_04', label: 'PLOT_SALES_REVENUE_BY_COUNTRY', prompt: 'Plot total sales by country as a bar chart' },
  { id: 'MACRO_05', label: 'QUERY_ALBUMS_BY_LED_ZEPPELIN', prompt: 'Show albums by Led Zeppelin with track counts' },
  { id: 'MACRO_06', label: 'VISUALIZE_MONTHLY_REVENUE_TREND', prompt: 'What is the monthly revenue trend over all years?' },
]

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  // Refs to prevent stale closures in stable callbacks
  const isLoadingRef = useRef(false)
  const activeConversationIdRef = useRef<string | null>(null)
  const messagesRef = useRef<Message[]>([])
  const selectedConnectionIdRef = useRef<string | null>(null)

  const { data: connections = [] } = useQuery<UserConnection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionsApi.list(),
  })

  useEffect(() => {
    selectedConnectionIdRef.current = selectedConnectionId
  }, [selectedConnectionId])

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // skipNextLoad is set to true when activeConversationId is assigned
  // programmatically during a live SSE stream (new conversation created on backend).
  // In that case we do NOT want to refetch from DB and overwrite in-memory messages.
  const skipNextLoadRef = useRef(false)

  // Only reload messages when the user selects a conversation from the sidebar.
  // Do NOT depend on isLoading — that caused a race: when streaming finished,
  // isLoading flipped to false, the effect re-ran, fetched from DB before the
  // assistant message was committed, and overwrote the in-memory streamed state.
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false
      return
    }
    loadConversationMessages(activeConversationId)
  }, [activeConversationId])

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`)
      const loaded: Message[] = data.map((m: Record<string, unknown>) => ({
        id: m.id as string,
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
        generatedSql: m.generated_sql as string | null,
        chartBase64: m.chart_base64 as string | null,
        retryCount: m.retry_count as number | null,
        tableData: null,       // not persisted, only in-session
        reasoningSteps: [],    // not persisted
      }))
      setMessages(loaded)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSelectConversation = (id: string) => {
    // skipNextLoad stays false here — we WANT to load from DB when switching sidebar items
    skipNextLoadRef.current = false
    activeConversationIdRef.current = id
    setActiveConversationId(id)
    setMessages([])
  }

  const handleNewConversation = () => {
    activeConversationIdRef.current = null
    setActiveConversationId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoadingRef.current) return

    // Set loading FIRST so the typing indicator appears immediately
    isLoadingRef.current = true
    setIsLoading(true)
    setInput('')

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    }

    const assistantId = `assistant-${Date.now()}`
    const assistantPlaceholder: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      reasoningSteps: [],
    }

    setMessages(prev => [...prev, userMsg, assistantPlaceholder])

    let streamedContent = ''
    let streamedSql: string | null = null
    let streamedChart: string | null = null
    let streamedTable: TableData | null = null

    // Helper to make the streaming request with the current access token.
    // fetch() bypasses the axios interceptor, so we handle 401 + refresh here.
    const doFetch = async (token: string | null) =>
      fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          question,
          conversation_id: activeConversationIdRef.current,
          connection_id: selectedConnectionIdRef.current ?? undefined,
        }),
      })

    try {
      // Proactively ensure we have a valid token before streaming
      let token = getAccessToken()
      if (!token) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) {
          setAccessToken(refreshed)
          token = refreshed
        }
      }

      let response = await doFetch(token)

      // If 401, try a token refresh ONCE then retry
      if (response.status === 401) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) {
          setAccessToken(refreshed)
          response = await doFetch(refreshed)
        } else {
          // No valid session — the unauthenticated callback in api.ts will
          // navigate to /login. We just surface a friendly error.
          throw new Error('Session expired. Please log in again.')
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const processSseLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        try {
          const event = JSON.parse(line.slice(6))

          if (event.type === 'conversation_id') {
            skipNextLoadRef.current = true
            activeConversationIdRef.current = event.conversation_id
            setActiveConversationId(event.conversation_id)
          }

          if (event.type === 'reasoning') {
            const step: ReasoningStep = {
              node: event.node,
              detail: event.detail,
              timestamp: Date.now(),
            }
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      reasoningSteps: [...(m.reasoningSteps ?? []), step],
                    }
                  : m
              )
            )
          }

          if (event.type === 'table') {
            streamedTable = {
              columns: event.columns,
              rows: event.rows,
              totalRows: event.total_rows,
            }
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, tableData: streamedTable }
                  : m
              )
            )
          }

          if (event.type === 'token') {
            streamedContent += event.content
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: streamedContent, isStreaming: true }
                  : m
              )
            )
          }

          if (event.type === 'sql') {
            streamedSql = event.content
          }

          if (event.type === 'chart') {
            streamedChart = event.content
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, chartBase64: event.content } : m
              )
            )
          }

          if (event.type === 'approval_required') {
            streamedSql = event.sql
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      isStreaming: false,
                      approvalRequest: {
                        sql: event.sql,
                        conversationId: event.conversation_id || activeConversationIdRef.current || '',
                        question: event.question || question,
                        status: 'pending',
                      },
                    }
                  : m
              )
            )
          }

          if (event.type === 'done') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      isStreaming: false,
                      generatedSql: streamedSql,
                      chartBase64: streamedChart || event.chart_base64,
                      retryCount: event.retry_count,
                      tableData: streamedTable,
                    }
                  : m
              )
            )
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          }

          if (event.type === 'error') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: `⚠️ ${event.content}`, isStreaming: false }
                  : m
              )
            )
          }
        } catch {
          // Non-JSON SSE line, ignore
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (value) {
          buffer += decoder.decode(value, { stream: true })
        }
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          processSseLine(line.trim())
        }

        if (done) {
          if (buffer.trim()) {
            processSseLine(buffer.trim())
          }
          break
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: `Sorry, something went wrong. Please try again.\n\n_Error: ${errMsg}_`,
                isStreaming: false,
              }
            : m
        )
      )
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [queryClient])

  const handleReview = useCallback(async (messageId: string, approved: boolean, feedback?: string) => {
    if (isLoadingRef.current) return

    const targetMsg = messagesRef.current.find(m => m.id === messageId)
    const convoId = targetMsg?.approvalRequest?.conversationId || activeConversationIdRef.current
    if (!convoId) return

    isLoadingRef.current = true
    setIsLoading(true)

    setMessages(prev =>
      prev.map(m =>
        m.id === messageId && m.approvalRequest
          ? {
              ...m,
              isStreaming: true,
              approvalRequest: {
                ...m.approvalRequest,
                status: approved ? 'approved' : 'rejected',
              },
            }
          : m
      )
    )

    let streamedContent = targetMsg?.content || ''
    let streamedSql: string | null = targetMsg?.generatedSql || targetMsg?.approvalRequest?.sql || null
    let streamedChart: string | null = targetMsg?.chartBase64 || null
    let streamedTable: TableData | null = targetMsg?.tableData || null

    const doReviewFetch = async (token: string | null) =>
      fetch(`${API_URL}/chat/review/${convoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          approved,
          feedback: feedback || undefined,
        }),
      })

    try {
      let token = getAccessToken()
      if (!token) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) {
          setAccessToken(refreshed)
          token = refreshed
        }
      }

      let response = await doReviewFetch(token)

      if (response.status === 401) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) {
          setAccessToken(refreshed)
          response = await doReviewFetch(refreshed)
        } else {
          throw new Error('Session expired. Please log in again.')
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))

              if (event.type === 'reasoning') {
                const step: ReasoningStep = {
                  node: event.node,
                  detail: event.detail,
                  timestamp: Date.now(),
                }
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId
                      ? {
                          ...m,
                          reasoningSteps: [...(m.reasoningSteps ?? []), step],
                        }
                      : m
                  )
                )
              }

              if (event.type === 'table') {
                streamedTable = {
                  columns: event.columns,
                  rows: event.rows,
                  totalRows: event.total_rows,
                }
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId
                      ? { ...m, tableData: streamedTable }
                      : m
                  )
                )
              }

              if (event.type === 'token') {
                streamedContent += event.content
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId
                      ? { ...m, content: streamedContent, isStreaming: true }
                      : m
                  )
                )
              }

              if (event.type === 'sql') {
                streamedSql = event.content
              }

              if (event.type === 'chart') {
                streamedChart = event.content
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId ? { ...m, chartBase64: event.content } : m
                  )
                )
              }

              if (event.type === 'approval_required') {
                streamedSql = event.sql
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId
                      ? {
                          ...m,
                          isStreaming: false,
                          approvalRequest: {
                            sql: event.sql,
                            conversationId: event.conversation_id,
                            question: event.question,
                            status: 'pending',
                          },
                        }
                      : m
                  )
                )
              }

              if (event.type === 'done') {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId
                      ? {
                          ...m,
                          isStreaming: false,
                          generatedSql: streamedSql,
                          chartBase64: streamedChart || event.chart_base64,
                          retryCount: event.retry_count,
                          tableData: streamedTable,
                        }
                      : m
                  )
                )
                queryClient.invalidateQueries({ queryKey: ['conversations'] })
              }

              if (event.type === 'error') {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === messageId
                      ? { ...m, content: `⚠️ ${event.content}`, isStreaming: false }
                      : m
                  )
                )
              }
            } catch {
              // Non-JSON SSE line, ignore
            }
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? {
                ...m,
                content: `${m.content ? m.content + '\n\n' : ''}⚠️ _Error resuming review: ${errMsg}_`,
                isStreaming: false,
              }
            : m
        )
      )
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [queryClient])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      <Sidebar
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-surface-950 font-mono text-xs flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden btn-ghost p-1.5"
              aria-label="Open sidebar"
            >
              <span>[≡]</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="text-brand-500 font-bold">/// COCKPIT_SESSION:</span>
              <span className="text-white font-semibold">
                {activeConversationId ? activeConversationId.slice(0, 8).toUpperCase() : 'NEW_TRANSACTION'}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-6 text-slate-400">
            <span>TARGET: <strong className="text-slate-200">chinook_music_store.postgresql</strong></span>
            <span>SANDBOX: <strong className="text-emerald-400">ISOLATED_OK</strong></span>
            <span>DIALECT: <strong className="text-slate-200">ANSI_SQL/PG</strong></span>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-3">
            <AnimatePresence>
              {isLoading ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 px-2.5 py-1 bg-brand-950/40 border border-brand-500/40 rounded text-brand-400 font-bold"
                >
                  <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-ping" />
                  <span>[COMPILING_AST...]</span>
                </motion.div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block" />
                  <span>IDLE_READY</span>
                </div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto py-6"
            >
              <div className="w-full terminal-panel p-8 md:p-10 border-slate-800 shadow-2xl relative">
                {/* Corner crosshairs */}
                <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-brand-500" />
                <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-brand-500" />
                <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-brand-500" />
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-brand-500" />

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-6 font-mono text-xs text-slate-500">
                  <span className="text-brand-500 font-bold">// AUTONOMOUS_SQL_ENGINEERING_CONSOLE</span>
                  <span>[RAG_PRUNER: ENABLED]</span>
                </div>

                <h2 className="text-2xl md:text-3xl font-bold text-white mb-3 font-sans tracking-tight">
                  Data Analyst Cockpit v2.0
                </h2>
                <p className="text-slate-400 text-xs md:text-sm max-w-xl mb-8 font-sans leading-relaxed">
                  Enter natural-language parameters or select a pre-compiled macro below. The system will prune catalog tokens, self-correct syntax via AST compilation, and stream high-speed visual analytics.
                </p>

                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-3">
                  [PRE_COMPILED_EXECUTION_MACROS]
                </div>

                {/* Suggestion macros grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full font-mono text-xs">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => sendMessage(s.prompt)}
                      disabled={isLoading}
                      className="bg-surface-950/80 hover:bg-surface-850 border border-slate-800 hover:border-brand-500/60 p-3.5 rounded text-left transition-all duration-150 group flex items-start justify-between gap-3 shadow-inner cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="text-[10px] text-brand-500 font-bold flex items-center gap-1.5">
                          <span>[{s.id}]</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-slate-400 group-hover:text-white transition-colors">{s.label}</span>
                        </div>
                        <div className="text-slate-300 font-sans text-xs group-hover:text-brand-300 transition-colors">
                          "{s.prompt}"
                        </div>
                      </div>
                      <span className="text-slate-600 group-hover:text-brand-400 group-hover:translate-x-1 transition-all">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} onReview={handleReview} />
          ))}
          <div ref={messagesEndRef} />
        </main>

        {/* Input area */}
        <footer className="px-6 py-4 border-t border-slate-800 bg-surface-950 flex-shrink-0 font-mono">
          <div className="max-w-4xl mx-auto mb-2">
            <DatasourcePicker
              connections={connections}
              selectedId={selectedConnectionId}
              onChange={setSelectedConnectionId}
            />
          </div>
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-3 bg-surface-900 border border-slate-800 focus-within:border-brand-500 rounded-md px-4 py-3 shadow-inner transition-colors">
              <span className="text-brand-500 font-bold py-0.5 select-none">&gt;</span>
              <textarea
                ref={inputRef}
                id="chat-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
                }}
                onKeyDown={handleKeyDown}
                placeholder={selectedConnectionId
                  ? `Query ${connections.find(c => c.id === selectedConnectionId)?.name ?? 'your database'}... (Enter to execute)`
                  : 'Enter query parameters for chinook database... (Enter to execute, Shift+Enter for multiline)'}
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-xs font-mono resize-none
                           focus:outline-none py-0.5 max-h-[200px] overflow-y-auto"
                style={{ minHeight: '20px' }}
              />
              <button
                id="send-message-btn"
                type="submit"
                disabled={!input.trim() || isLoading}
                className="btn-primary py-2 px-4 text-xs flex items-center gap-1.5 flex-shrink-0"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-surface-950 border-t-transparent rounded-full animate-spin" />
                    <span>[EXEC]</span>
                  </>
                ) : (
                  <>
                    <span>[EXECUTE]</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-600 mt-2 px-1">
              <span>LIMIT: 200 ROWS // ACCESS: READ_ONLY_ROLE</span>
              <span>ENVIRONMENT: PROCESS_ISOLATED_SANDBOX</span>
            </div>
          </form>
        </footer>
      </div>
    </div>
  )
}
