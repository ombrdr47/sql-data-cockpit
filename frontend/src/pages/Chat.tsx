/**
 * pages/Chat.tsx
 * Main console interface — restyled per UI.md.
 * All SSE streaming logic, HITL flow, conversation management,
 * and API calls are preserved verbatim. Only JSX markup and class names changed.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import MessageBubble, { type Message, type TableData } from '../components/MessageBubble'
import Sidebar from '../components/Sidebar'
import { type ReasoningStep } from '../components/AgentProgress'
import api, { getAccessToken, attemptTokenRefresh, setAccessToken, connectionsApi, type UserConnection } from '../lib/api'
import DatasourcePicker from '../components/DatasourcePicker'

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
  const [noApiKey, setNoApiKey]               = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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

  const loadConversationMessages = useCallback(async (conversationId: string) => {
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
  }, [])

  // Only reload messages when the user selects a conversation from the sidebar.
  useEffect(() => {
    if (!activeConversationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([])
      return
    }
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false
      return
    }
    loadConversationMessages(activeConversationId)
  }, [activeConversationId, loadConversationMessages])

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

      if (response.status === 400) {
        // Check for "no API key" sentinel from backend
        try {
          const errBody = await response.json()
          if (errBody?.detail === 'no_api_key') {
            setNoApiKey(true)
            setMessages(prev => prev.filter(m => m.id !== assistantId && m.id !== userMsg.id))
            isLoadingRef.current = false
            setIsLoading(false)
            return
          }
        } catch { /* ignore parse error */ }
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
        ? { ...m, isStreaming: true, approvalRequest: { ...m.approvalRequest, status: approved ? 'approved' : 'processing' } }
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
                    ? { ...m, isStreaming: false, approvalRequest: null, generatedSql: streamedSql, chartBase64: streamedChart || event.chart_base64, retryCount: event.retry_count, tableData: streamedTable }
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
    <div className="flex h-dvh bg-surface-950 overflow-hidden">
      <Sidebar
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(p => !p)}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — solid surface, no glassmorphism */}
        <header className="flex items-center justify-between px-4 sm:px-5 py-3
                           border-b border-white/[0.07] bg-surface-950 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile burger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden flex-shrink-0 w-10 h-10 flex items-center justify-center
                         rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]
                         transition-colors duration-150"
              aria-label="Open sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop: show sidebar button (only when collapsed) */}
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="hidden md:flex flex-shrink-0 w-8 h-8 items-center justify-center
                           rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]
                           transition-colors duration-150"
                aria-label="Show sidebar"
                title="Show sidebar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
                </svg>
              </button>
            )}

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-md bg-accent-600 hidden sm:flex items-center justify-center flex-shrink-0">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="text-slate-300 font-medium text-sm truncate max-w-[140px] sm:max-w-xs">
                {activeConversationId ? `Chat · ${activeConversationId.slice(0, 8)}` : 'New chat'}
              </span>
            </div>
          </div>

          {/* Right side: status + settings */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-xs text-slate-400"
                >
                  <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse flex-shrink-0" />
                  <span className="hidden xs:inline">Working…</span>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs text-slate-500"
                >
                  <span className="w-1.5 h-1.5 rounded-full"
                        style={{ background: 'var(--status-success)' }} />
                  <span className="hidden sm:inline">Ready</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Settings link — always visible */}
            <Link
              to="/settings"
              className="flex items-center justify-center w-8 h-8 rounded-lg
                         text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]
                         transition-colors duration-150"
              title="Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </header>

        {/* No-API-key banner */}
        {noApiKey && (
          <div className="mx-4 sm:mx-5 mt-3 mb-0 flex items-start gap-3 px-4 py-3.5
                          bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" className="text-amber-400 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-300 font-medium">Groq API key required</p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Add your Groq API key in Settings to start chatting.
              </p>
            </div>
            <Link
              to="/settings"
              className="flex-shrink-0 text-xs font-medium text-amber-300 hover:text-amber-200
                         border border-amber-500/30 rounded-lg px-3 py-1.5 transition-colors
                         hover:bg-amber-500/10"
            >
              Go to Settings →
            </Link>
          </div>
        )}

        {/* Messages — scrollable, full height */}
        <main className="flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-6 space-y-2">

          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="pt-4 sm:pt-8"
            >
              {/* Greeting */}
              <div className="text-center mb-8 sm:mb-10">
                <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center mx-auto mb-4">
                  <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                    <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </div>
                <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">How can I help?</h2>
                <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Ask a question about your data in plain English.
                </p>
              </div>

              {/* Suggestion cards — neutral, no accent color */}
              <p className="text-[11px] text-slate-500 mb-3 font-medium uppercase tracking-wider px-1">Try a question</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, duration: 0.25 }}
                    onClick={() => sendMessage(s.prompt)}
                    disabled={isLoading}
                    className="bg-surface-900 border border-white/[0.08]
                               hover:border-white/[0.14] hover:bg-surface-850
                               p-4 rounded-xl text-left transition-colors duration-150
                               flex items-center justify-between gap-3
                               disabled:opacity-40 cursor-pointer min-h-[56px]"
                  >
                    <span className="text-sm text-slate-300 hover:text-white leading-snug">
                      {s.label}
                    </span>
                    <span className="text-slate-600 flex-shrink-0 text-sm">→</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} onReview={handleReview} />
          ))}
          <div ref={messagesEndRef} className="h-2" />
          </div>
        </main>

        {/* Input area — solid surface, iOS safe area */}
        <footer className="px-3 sm:px-5 pt-3 border-t border-white/[0.07] flex-shrink-0 bg-surface-950"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {/* Datasource picker */}
          <div className="max-w-3xl mx-auto mb-2.5">
            <DatasourcePicker
              connections={connections}
              selectedId={selectedConnectionId}
              onChange={setSelectedConnectionId}
            />
          </div>

          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 sm:gap-3 bg-surface-900 border border-white/[0.10]
                            focus-within:border-accent-600/40 focus-within:ring-1 focus-within:ring-accent-600/15
                            rounded-xl px-3 sm:px-4 py-2.5 transition-colors duration-150">
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
                  : 'Ask anything about your database…'}
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm
                           resize-none focus:outline-none max-h-[160px] overflow-y-auto
                           py-1.5 leading-relaxed"
                style={{ minHeight: '24px' }}
              />
              <button
                id="send-message-btn"
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
                           bg-accent-600 hover:bg-accent-700
                           disabled:opacity-30 disabled:cursor-not-allowed
                           transition-colors duration-150 active:scale-[0.95]"
                aria-label="Send"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 px-1 text-center sm:text-left">
              Read-only · Up to 200 rows · Enter to send, Shift+Enter for new line
            </p>
          </form>
        </footer>
      </div>
    </div>
  )
}
