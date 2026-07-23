/**
 * pages/Chat.tsx
 * Main console interface — restyled per UI.md.
 * All SSE streaming logic, HITL flow, conversation management,
 * and API calls are preserved verbatim. Only JSX markup and class names changed.
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
  { id: 'MACRO_01', label: 'Top artists by track count',        prompt: 'Show me the top 5 artists by track count' },
  { id: 'MACRO_02', label: 'Top customers by revenue',          prompt: 'What are the top 10 customers by total revenue?' },
  { id: 'MACRO_03', label: 'Genres with over 100 tracks',       prompt: 'Which genres have more than 100 tracks?' },
  { id: 'MACRO_04', label: 'Sales revenue by country (chart)',  prompt: 'Plot total sales by country as a bar chart' },
  { id: 'MACRO_05', label: 'Led Zeppelin albums & track counts',prompt: 'Show albums by Led Zeppelin with track counts' },
  { id: 'MACRO_06', label: 'Monthly revenue trend',             prompt: 'What is the monthly revenue trend over all years?' },
]

export default function Chat() {
  const [messages, setMessages]               = useState<Message[]>([])
  const [input, setInput]                     = useState('')
  const [isLoading, setIsLoading]             = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const messagesEndRef   = useRef<HTMLDivElement>(null)
  const inputRef         = useRef<HTMLTextAreaElement>(null)
  const queryClient      = useQueryClient()

  // Refs to prevent stale closures in stable callbacks
  const isLoadingRef              = useRef(false)
  const activeConversationIdRef   = useRef<string | null>(null)
  const messagesRef               = useRef<Message[]>([])
  const selectedConnectionIdRef   = useRef<string | null>(null)

  const { data: connections = [] } = useQuery<UserConnection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionsApi.list(),
  })

  useEffect(() => { selectedConnectionIdRef.current = selectedConnectionId }, [selectedConnectionId])
  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { activeConversationIdRef.current = activeConversationId }, [activeConversationId])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // skipNextLoad is set to true when activeConversationId is assigned
  // programmatically during a live SSE stream (new conversation created on backend).
  // In that case we do NOT want to refetch from DB and overwrite in-memory messages.
  const skipNextLoadRef = useRef(false)

  // Only reload messages when the user selects a conversation from the sidebar.
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
        tableData: null,
        reasoningSteps: [],
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
    let streamedSql:   string | null    = null
    let streamedChart: string | null    = null
    let streamedTable: TableData | null = null

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
      let token = getAccessToken()
      if (!token) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) { setAccessToken(refreshed); token = refreshed }
      }

      let response = await doFetch(token)

      if (response.status === 401) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) {
          setAccessToken(refreshed)
          response = await doFetch(refreshed)
        } else {
          throw new Error('Session expired. Please log in again.')
        }
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader  = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

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
            const step: ReasoningStep = { node: event.node, detail: event.detail, timestamp: Date.now() }
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, reasoningSteps: [...(m.reasoningSteps ?? []), step] } : m
            ))
          }

          if (event.type === 'table') {
            streamedTable = { columns: event.columns, rows: event.rows, totalRows: event.total_rows }
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, tableData: streamedTable } : m
            ))
          }

          if (event.type === 'token') {
            streamedContent += event.content
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: streamedContent, isStreaming: true } : m
            ))
          }

          if (event.type === 'sql') { streamedSql = event.content }

          if (event.type === 'chart') {
            streamedChart = event.content
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, chartBase64: event.content } : m
            ))
          }

          if (event.type === 'approval_required') {
            streamedSql = event.sql
            setMessages(prev => prev.map(m =>
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
            ))
          }

          if (event.type === 'done') {
            setMessages(prev => prev.map(m =>
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
            ))
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          }

          if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: `⚠️ ${event.content}`, isStreaming: false } : m
            ))
          }
        } catch {
          // Non-JSON SSE line, ignore
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (value) buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) processSseLine(line.trim())
        if (done) { if (buffer.trim()) processSseLine(buffer.trim()); break }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Sorry, something went wrong. Please try again.\n\n_Error: ${errMsg}_`, isStreaming: false }
          : m
      ))
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [queryClient])

  const handleReview = useCallback(async (messageId: string, approved: boolean, feedback?: string) => {
    if (isLoadingRef.current) return

    const targetMsg = messagesRef.current.find(m => m.id === messageId)
    const convoId   = targetMsg?.approvalRequest?.conversationId || activeConversationIdRef.current
    if (!convoId) return

    isLoadingRef.current = true
    setIsLoading(true)

    setMessages(prev => prev.map(m =>
      m.id === messageId && m.approvalRequest
        ? { ...m, isStreaming: true, approvalRequest: { ...m.approvalRequest, status: approved ? 'approved' : 'rejected' } }
        : m
    ))

    let streamedContent = targetMsg?.content || ''
    let streamedSql:   string | null    = targetMsg?.generatedSql || targetMsg?.approvalRequest?.sql || null
    let streamedChart: string | null    = targetMsg?.chartBase64 || null
    let streamedTable: TableData | null = targetMsg?.tableData || null

    const doReviewFetch = async (token: string | null) =>
      fetch(`${API_URL}/chat/review/${convoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ approved, feedback: feedback || undefined }),
      })

    try {
      let token = getAccessToken()
      if (!token) {
        const refreshed = await attemptTokenRefresh()
        if (refreshed) { setAccessToken(refreshed); token = refreshed }
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

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader  = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

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
                const step: ReasoningStep = { node: event.node, detail: event.detail, timestamp: Date.now() }
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, reasoningSteps: [...(m.reasoningSteps ?? []), step] } : m
                ))
              }

              if (event.type === 'table') {
                streamedTable = { columns: event.columns, rows: event.rows, totalRows: event.total_rows }
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, tableData: streamedTable } : m
                ))
              }

              if (event.type === 'token') {
                streamedContent += event.content
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, content: streamedContent, isStreaming: true } : m
                ))
              }

              if (event.type === 'sql') { streamedSql = event.content }

              if (event.type === 'chart') {
                streamedChart = event.content
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, chartBase64: event.content } : m
                ))
              }

              if (event.type === 'approval_required') {
                streamedSql = event.sql
                setMessages(prev => prev.map(m =>
                  m.id === messageId
                    ? { ...m, isStreaming: false, approvalRequest: { sql: event.sql, conversationId: event.conversation_id, question: event.question, status: 'pending' } }
                    : m
                ))
              }

              if (event.type === 'done') {
                setMessages(prev => prev.map(m =>
                  m.id === messageId
                    ? { ...m, isStreaming: false, generatedSql: streamedSql, chartBase64: streamedChart || event.chart_base64, retryCount: event.retry_count, tableData: streamedTable }
                    : m
                ))
                queryClient.invalidateQueries({ queryKey: ['conversations'] })
              }

              if (event.type === 'error') {
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, content: `⚠️ ${event.content}`, isStreaming: false } : m
                ))
              }
            } catch {
              // Non-JSON SSE line, ignore
            }
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, content: `${m.content ? m.content + '\n\n' : ''}⚠️ _Error resuming review: ${errMsg}_`, isStreaming: false }
          : m
      ))
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
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]
                           bg-surface-950 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden btn-ghost p-1.5"
              aria-label="Open sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Session</span>
              <span className="text-slate-300 font-medium font-mono text-xs">
                {activeConversationId ? activeConversationId.slice(0, 8) : 'new'}
              </span>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-2 text-xs text-slate-400"
                >
                  <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" />
                  Working…
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs text-slate-500"
                >
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  Ready
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-5 py-6 space-y-2">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto py-8"
            >
              {/* Empty state */}
              <div className="w-full card p-8 md:p-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 bg-accent-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">SQL Cockpit</h2>
                    <p className="text-xs text-slate-500">Powered by LangGraph · Groq</p>
                  </div>
                </div>

                <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-xl">
                  Ask a question about your data in plain English. The agent will select the relevant
                  tables, generate and validate SQL, then return a table or chart.
                </p>

                <p className="text-xs text-slate-500 mb-3 font-medium">Try a sample question</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => sendMessage(s.prompt)}
                      disabled={isLoading}
                      className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08]
                                 hover:border-white/[0.16] p-3.5 rounded-xl text-left transition-all
                                 duration-150 group flex items-center justify-between gap-3
                                 disabled:opacity-40 cursor-pointer"
                    >
                      <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                        {s.label}
                      </span>
                      <span className="text-slate-600 group-hover:text-accent-400 group-hover:translate-x-0.5
                                       transition-all flex-shrink-0">
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
        <footer className="px-5 py-4 border-t border-white/[0.06] bg-surface-950 flex-shrink-0">
          <div className="max-w-3xl mx-auto mb-2">
            <DatasourcePicker
              connections={connections}
              selectedId={selectedConnectionId}
              onChange={setSelectedConnectionId}
            />
          </div>
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-3 bg-surface-900 border border-white/[0.10]
                            focus-within:border-accent-500/60 rounded-xl px-4 py-3 transition-colors">
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
                  ? `Ask ${connections.find(c => c.id === selectedConnectionId)?.name ?? 'your database'} anything…`
                  : 'Ask your database anything… (Enter to send, Shift+Enter for new line)'}
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm
                           resize-none focus:outline-none py-0.5 max-h-[200px] overflow-y-auto"
                style={{ minHeight: '20px' }}
              />
              <button
                id="send-message-btn"
                type="submit"
                disabled={!input.trim() || isLoading}
                className="btn-primary py-2 px-4 text-sm flex items-center gap-1.5 flex-shrink-0"
              >
                {isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Running</span>
                  </>
                ) : (
                  <>
                    <span>Run</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-2 px-1">
              Read-only queries only · Up to 200 rows returned
            </p>
          </form>
        </footer>
      </div>
    </div>
  )
}
