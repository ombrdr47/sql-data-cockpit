/**
 * pages/Chat.tsx
 * Analysis workspace: streaming conversations, SQL approval, and saved results.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import MessageBubble, { type Message, type TableData } from '../components/MessageBubble'
import Sidebar from '../components/Sidebar'
import { type ReasoningStep } from '../components/AgentProgress'
import api, { getAccessToken, attemptTokenRefresh, setAccessToken, connectionsApi, type UserConnection, type SavedAnalysis, type AnalysisSnapshot } from '../lib/api'
import DatasourcePicker from '../components/DatasourcePicker'
import ExploreResults, { type AnalysisResult } from '../components/ExploreResults'
import SavedAnalyses from '../components/SavedAnalyses'
import { Bookmark, PanelLeft, Plus, Settings, Database, ArrowUpRight } from 'lucide-react'
import '../explore.css'
import { useAuth } from '../lib/auth'
import { chartFromResults, chartRequested } from '../lib/resultChart'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const SUGGESTIONS = [
  { id: 'MACRO_01', label: 'Top artists by track count',        prompt: 'Show me the top 5 artists by track count',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg> },
  { id: 'MACRO_02', label: 'Top customers by revenue',          prompt: 'What are the top 10 customers by total revenue?',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> },
  { id: 'MACRO_03', label: 'Genres with over 100 tracks',       prompt: 'Which genres have more than 100 tracks?',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/></svg> },
  { id: 'MACRO_04', label: 'Sales by country — chart',          prompt: 'Plot total sales by country as a bar chart',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> },

]

function greeting(name: string) {
  const h = new Date().getHours()
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${time}${name ? `, ${name}` : ''}`
}

export default function Chat() {
  const [messages, setMessages]               = useState<Message[]>([])
  const [input, setInput]                     = useState('')
  const [isLoading, setIsLoading]             = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [noApiKey, setNoApiKey]               = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'conversation' | 'results'>('conversation')
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const messagesEndRef   = useRef<HTMLDivElement>(null)
  const inputRef         = useRef<HTMLTextAreaElement>(null)
  const queryClient      = useQueryClient()
  const { user }         = useAuth()

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
      if (activeConversationIdRef.current !== conversationId) return
      const loaded: Message[] = data.map((m: Record<string, unknown>) => {
        const snapshot = m.analysis_data as AnalysisSnapshot | null
        return ({
        id: m.id as string,
        role: m.role as 'user' | 'assistant',
        content: m.content as string,
        error: snapshot?.succeeded === false || /^(⚠️|Sorry, something went wrong)/.test(String(m.content)),
        generatedSql: m.generated_sql as string | null,
        chartBase64: m.chart_base64 as string | null,
        retryCount: m.retry_count as number | null,
        persistedId: m.id as string,
        querySucceeded: snapshot?.succeeded,
        ranAt: snapshot?.ran_at,
        tableData: snapshot?.succeeded && snapshot.rows ? { columns: snapshot.columns, rows: snapshot.rows, totalRows: snapshot.rows.length } : null,
        reasoningSteps: [],
      })})
      setMessages(loaded)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }, [])

  // Only reload messages when the user selects a conversation from the sidebar.
  useEffect(() => {
    if (!activeConversationId) {
      if (isLoadingRef.current) return
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

  const handleSelectConversation = (id: string, connectionId: string | null) => {
    if (isLoadingRef.current) return
    setSelectedResultId(null)
    setMobileView('conversation')
    selectedConnectionIdRef.current = connectionId
    setSelectedConnectionId(connectionId)
    skipNextLoadRef.current = false
    activeConversationIdRef.current = id
    setActiveConversationId(id)
    setMessages([])
  }

  const handleNewConversation = () => {
    if (isLoadingRef.current) return
    setSelectedResultId(null)
    setMobileView('conversation')
    activeConversationIdRef.current = null
    setActiveConversationId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  const sendMessage = useCallback(async (question: string, savedAnalysis?: SavedAnalysis) => {
    if (!question.trim() || isLoadingRef.current || messagesRef.current.some(m => m.approvalRequest?.status === 'pending')) return

    isLoadingRef.current = true
    setIsLoading(true)
    setInput('')
    setSelectedResultId(null)
    setMobileView('conversation')

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

    if (savedAnalysis) {
      activeConversationIdRef.current = null
      setActiveConversationId(null)
      selectedConnectionIdRef.current = savedAnalysis.connection_id
      setSelectedConnectionId(savedAnalysis.connection_id)
    }
    setMessages(prev => savedAnalysis ? [userMsg, assistantPlaceholder] : [...prev, userMsg, assistantPlaceholder])

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
          conversation_id: savedAnalysis ? null : activeConversationIdRef.current,
          saved_analysis_id: savedAnalysis?.id,
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

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`)
      }

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

          if (event.type === 'sql') {
            streamedSql = event.content
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, generatedSql: event.content } : m))
          }

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
                      sql: event.sql, reviewToken: event.review_token,
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
                    persistedId: event.message_id,
                    querySucceeded: event.query_succeeded,
                    ranAt: event.ran_at,
                    error: event.query_succeeded === false,
                  }
                : m
            ))
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
            queryClient.invalidateQueries({ queryKey: ['saved-analyses'] })
          }

          if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: `⚠️ ${event.content}`, isStreaming: false, error: true } : m
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
          ? { ...m, content: `Sorry, something went wrong. Please try again.\n\n_Error: ${errMsg}_`, isStreaming: false, error: true }
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
        body: JSON.stringify({ approved, review_token: targetMsg?.approvalRequest?.reviewToken, feedback: feedback || undefined }),
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

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`)
      }

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

              if (event.type === 'sql') {
                streamedSql = event.content
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, generatedSql: event.content } : m))
              }

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
                    ? { ...m, isStreaming: false, approvalRequest: { sql: event.sql, reviewToken: event.review_token, conversationId: event.conversation_id, question: event.question, status: 'pending' } }
                    : m
                ))
              }

              if (event.type === 'done') {
                setMessages(prev => prev.map(m =>
                  m.id === messageId
                    ? { ...m, isStreaming: false, approvalRequest: null, generatedSql: streamedSql, chartBase64: streamedChart || event.chart_base64, retryCount: event.retry_count, tableData: streamedTable, persistedId: event.message_id, querySucceeded: event.query_succeeded, ranAt: event.ran_at, error: event.query_succeeded === false }
                    : m
                ))
                if (event.query_succeeded && chartRequested(targetMsg?.approvalRequest?.question ?? '')
                    && (streamedChart || (streamedTable && chartFromResults(streamedTable)))) {
                  setSelectedResultId(messageId)
                  setMobileView('results')
                }
                queryClient.invalidateQueries({ queryKey: ['conversations'] })
                queryClient.invalidateQueries({ queryKey: ['saved-analyses'] })
              }

              if (event.type === 'error') {
                setMessages(prev => prev.map(m =>
                  m.id === messageId ? { ...m, content: `⚠️ ${event.content}`, isStreaming: false, error: true } : m
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
          ? { ...m, content: `${m.content ? m.content + '\n\n' : ''}⚠️ _Error resuming review: ${errMsg}_`, isStreaming: false, error: true }
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

  // Active conversation title for header display
  const { data: conversations = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['conversations'],
    queryFn: async () => { const { data } = await api.get('/conversations'); return data },
    staleTime: 30_000,
  })
  const activeTitle = useMemo(
    () => conversations.find(c => c.id === activeConversationId)?.title ?? null,
    [conversations, activeConversationId],
  )

  const analysisResults = useMemo(() => {
    let question = ''
    const results: AnalysisResult[] = []
    for (const message of messages) {
      if (message.role === 'user') question = message.content
      else results.push({ message, question })
    }
    return results
  }, [messages])

  const inspectResult = (id: string) => {
    setSelectedResultId(id)
    setMobileView('results')
  }
  const hasPendingReview = messages.some(m => m.approvalRequest?.status === 'pending')
  const sourceName = selectedConnectionId
    ? connections.find(c => c.id === selectedConnectionId)?.name ?? 'Connected database'
    : 'Chinook sample'

  return (
    <div className="explore-shell flex h-dvh overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <Sidebar
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(p => !p)}
        connectionSetupDisabled={isLoading || hasPendingReview}
        onConnectionReady={connection => {
          if (isLoadingRef.current || hasPendingReview) return
          selectedConnectionIdRef.current = connection.id
          setSelectedConnectionId(connection.id)
          handleNewConversation()
        }}
      />

      {libraryOpen && <SavedAnalyses busy={isLoading || hasPendingReview} onClose={() => setLibraryOpen(false)} onRun={analysis => { setLibraryOpen(false); void sendMessage(analysis.question, analysis) }} />}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">

        <header className="workspace-header">
          <div className="workspace-header-title">
            <button className="md:hidden workspace-icon-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar"><PanelLeft size={18} /></button>
            {sidebarCollapsed && <button className="hidden md:flex workspace-icon-button" onClick={() => setSidebarCollapsed(false)} aria-label="Show sidebar"><PanelLeft size={18} /></button>}
            <span className="workspace-section-name">Explore</span><span className="explore-header-divider">/</span><h1>{activeTitle ?? 'New analysis'}</h1>
          </div>
          <div className="workspace-header-actions">
            <span className={`workspace-status ${isLoading ? 'is-working' : ''}`} role="status"><i />{isLoading ? 'Working…' : hasPendingReview ? 'Needs review' : 'Ready'}</span>
            <button className="explore-library-button" aria-label="Saved analyses" onClick={() => setLibraryOpen(true)}><Bookmark size={15} /><span>Saved analyses</span></button>
            <button className="workspace-icon-button" onClick={handleNewConversation} title="New analysis" aria-label="New analysis"><Plus size={18} /></button>
            {user?.role !== 'sample_guest' && <Link to="/settings" className="workspace-icon-button" aria-label="Settings"><Settings size={17} /></Link>}
          </div>
        </header>

        {/* No-API-key banner */}
        {noApiKey && (
          <div className="mx-4 sm:mx-5 mt-3 flex items-start gap-3 px-4 py-3.5 rounded-xl"
               style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" className="text-amber-400 flex-shrink-0 mt-0.5">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-300 font-medium">Groq API key required</p>
              <p className="text-xs text-amber-400/60 mt-0.5">Add your Groq API key in Settings to start chatting.</p>
            </div>
            <Link to="/settings"
              className="flex-shrink-0 text-xs font-medium text-amber-300 hover:text-amber-200
                         border border-amber-500/25 rounded-lg px-3 py-1.5 transition-colors hover:bg-amber-500/08"
            >
              Settings →
            </Link>
          </div>
        )}

        <div className="explore-mobile-switch" aria-label="Workspace panel">
          <button aria-pressed={mobileView === 'conversation'} onClick={() => setMobileView('conversation')}>Conversation</button>
          <button aria-pressed={mobileView === 'results'} onClick={() => setMobileView('results')}>Results {analysisResults.length > 0 && `(${analysisResults.length})`}</button>
        </div>
        <div className="explore-workspace" data-mobile-view={mobileView}>
        <section className="explore-conversation" aria-label="Analysis conversation">
        <div className="explore-conversation-heading"><span>Conversation</span><span>Ask · refine · explore</span></div>
        {/* ── Messages ────────────────────────────────────────────────────────── */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-5 py-5 sm:py-6 space-y-2">

          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="pt-4 sm:pt-8"
            >
              <div className="workspace-welcome">
                <span className="explore-eyebrow">{greeting(user?.username ?? '')}</span>
                <h2>What would you<br /><em>like to understand?</em></h2>
                <p>Start with a question about {sourceName}. Review the SQL, then explore the answer.</p>
              </div>
              <div className="workspace-starters-heading"><span>{selectedConnectionId ? 'YOUR DATABASE' : 'A FEW PLACES TO START'}</span><Database size={14} /></div>
              {selectedConnectionId ? <p className="workspace-connected-hint">Ask about a table, a trend, or a metric in your data. You can change the data source below.</p> : <div className="workspace-starters">
                {SUGGESTIONS.map(s => <button key={s.id} onClick={() => sendMessage(s.prompt)} disabled={isLoading}>
                  <span>{s.icon}</span><span>{s.label}</span><ArrowUpRight size={15} />
                </button>)}
              </div>}
              <p className="workspace-start-note">Every query pauses for your review before it runs.</p>
            </motion.div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} onReview={handleReview} onInspect={inspectResult} />
          ))}
          <div ref={messagesEndRef} className="h-2" />
          </div>
        </main>

        {/* ── Input ────────────────────────────────────────────────────────────── */}
        <footer className="workspace-composer px-3 sm:px-5 pt-3 flex-shrink-0"
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                  background: 'var(--bg-app)',
                  paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                }}>
          <div className="max-w-3xl mx-auto mb-2.5">
            <DatasourcePicker
              connections={connections}
              selectedId={selectedConnectionId}
              disabled={isLoading}
              onChange={(connectionId) => {
                if (isLoadingRef.current || connectionId === selectedConnectionIdRef.current) return
                selectedConnectionIdRef.current = connectionId
                setSelectedConnectionId(connectionId)
                handleNewConversation()
              }}
            />
          </div>

          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div
              className="workspace-input-wrap flex items-end gap-2 sm:gap-3 rounded-xl px-3 sm:px-4 py-2.5
                          transition-all duration-200"
              style={{ background: 'var(--bg-input)', border: '1px solid rgba(255,255,255,0.08)' }}
              // container-level focus glow handled on textarea events below
            >
              <textarea
                ref={inputRef}
                id="chat-input"
                aria-label="Ask a question about your data"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
                }}
                onKeyDown={handleKeyDown}
                onFocus={e => {
                  const p = e.currentTarget.parentElement
                  if (p) { p.style.borderColor = 'rgba(37,99,235,0.50)'; p.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.11), 0 0 28px rgba(37,99,235,0.06)' }
                }}
                onBlur={e => {
                  const p = e.currentTarget.parentElement
                  if (p) { p.style.borderColor = 'rgba(255,255,255,0.08)'; p.style.boxShadow = 'none' }
                }}
                placeholder={hasPendingReview ? 'Review the pending query to continue…' : selectedConnectionId
                  ? `Ask ${connections.find(c => c.id === selectedConnectionId)?.name ?? 'your database'} anything…`
                  : 'Ask anything about your database…'}
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-sm
                           resize-none focus:outline-none max-h-[160px] overflow-y-auto py-1.5 leading-relaxed"
                style={{ minHeight: '24px' }}
              />
              <button
                id="send-message-btn"
                type="submit"
                disabled={!input.trim() || isLoading || hasPendingReview}
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center
                           disabled:opacity-25 disabled:cursor-not-allowed
                           transition-all duration-200 active:scale-[0.94]"
                style={{
                  background: input.trim() && !isLoading
                    ? '#3157db'
                    : 'rgba(255,255,255,0.05)',
                  boxShadow: input.trim() && !isLoading ? '0 2px 12px rgba(37,99,235,0.28)' : 'none',
                }}
                aria-label="Send"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg
                    width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"

                  >
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between mt-1.5 px-1">
              <p className="text-[11px] text-slate-700">Enter to send · Shift + Enter for a new line</p>
              {input.length > 0 && <p className="text-[11px] text-slate-700">{input.length} chars</p>}
            </div>
          </form>
        </footer>
        </section>
        <ExploreResults
          results={analysisResults}
          selectedId={selectedResultId}
          source={sourceName}
          busy={isLoading || hasPendingReview}
          onSelect={setSelectedResultId}
          onAsk={sendMessage}
          onConversation={() => { setMobileView('conversation'); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
        />
        </div>
      </div>
    </div>
  )
}
