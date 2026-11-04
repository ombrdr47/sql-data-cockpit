/**
 * components/Sidebar.tsx
 * Conversation history sidebar — refined.
 * Features:
 *  - Date grouping: Today / Yesterday / This week / Older
 *  - Relative timestamps on each conversation item
 *  - Resizable width via drag handle (desktop)
 *  - Collapsible on desktop
 *  - Gradient user avatar unique per username
 *  - Clean footer: user info + settings + logout with icons
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { connectionsApi, type UserConnection } from '../lib/api'
import { useAuth } from '../lib/auth'
import ConnectionModal from './ConnectionModal'
import BrandMark from './BrandMark'
import { ReferenceManager } from './ReferenceFiles'
import { FileText } from 'lucide-react'

interface Conversation {
  id: string
  connection_id?: string | null
  title: string
  created_at: string
  updated_at: string
}

interface SidebarProps {
  activeConversationId: string | null
  onSelectConversation: (id: string, connectionId: string | null) => void
  onNewConversation: () => void
  isOpen: boolean
  onClose: () => void
  collapsed?: boolean
  connectionSetupDisabled?: boolean
  onConnectionReady?: (connection: UserConnection) => void
  onToggleCollapse?: () => void
}

const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 248

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a gradient pair deterministically from a username string */
function avatarGradient(str: string): [string, string] {
  const palettes: [string, string][] = [
    ['#3b82f6', '#6366f1'],
    ['#8b5cf6', '#a855f7'],
    ['#06b6d4', '#0ea5e9'],
    ['#10b981', '#059669'],
    ['#f59e0b', '#ef4444'],
    ['#ec4899', '#f43f5e'],
  ]
  let h = 0
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h)
  return palettes[Math.abs(h) % palettes.length]
}

/** Relative timestamp label (e.g. "2h ago", "just now") */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Group conversations by recency bucket */
function groupConversations(convos: Conversation[]) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 6 * 86400000

  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today',     items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Older',     items: [] },
  ]

  for (const c of convos) {
    const t = new Date(c.updated_at).getTime()
    if (t >= todayStart)     groups[0].items.push(c)
    else if (t >= yesterdayStart) groups[1].items.push(c)
    else if (t >= weekStart)      groups[2].items.push(c)
    else                          groups[3].items.push(c)
  }

  return groups.filter(g => g.items.length > 0)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onClose,
  collapsed = false,
  onToggleCollapse,
  onConnectionReady,
  connectionSetupDisabled = false,
}: SidebarProps) {
  const [referenceConnection, setReferenceConnection] = useState<UserConnection | null>(null)
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editTitle, setEditTitle]         = useState('')
  const [showConnModal, setShowConnModal] = useState(false)
  const [width, setWidth]                 = useState(DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const startX     = useRef(0)
  const startW     = useRef(DEFAULT_WIDTH)

  // ── Drag-to-resize ─────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const delta = e.clientX - startX.current
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta)))
    }
    const onMouseUp = () => {
      if (!isDragging.current) return
      isDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: connections = [] } = useQuery<UserConnection[]>({
    queryKey: ['connections'],
    queryFn: () => connectionsApi.list(),
  })

  const deleteConnMutation = useMutation({
    mutationFn: (id: string) => connectionsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] }),
  })

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data } = await api.get('/conversations')
      return data
    },
  })

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      await api.patch(`/conversations/${id}`, { title })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setEditingId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/conversations/${id}`) },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (activeConversationId === id) onNewConversation()
    },
  })

  const handleRenameStart = (convo: Conversation) => {
    setEditingId(convo.id)
    setEditTitle(convo.title)
  }

  const handleRenameSubmit = (id: string) => {
    if (editTitle.trim()) renameMutation.mutate({ id, title: editTitle.trim() })
    else setEditingId(null)
  }

  const grouped = useMemo(() => groupConversations(conversations), [conversations])
  const [avatarFrom, avatarTo] = avatarGradient(user?.username ?? 'user')

  // ── Sidebar content ────────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="workspace-sidebar flex flex-col h-full select-none"
         style={{ background: 'var(--bg-sidebar)' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
           style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <span className="font-semibold text-white text-sm">SQL Cockpit</span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg
                         text-slate-600 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
              title="Hide sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7"/>
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close sidebar"
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg
                       text-slate-600 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── New conversation button ─────────────────────────────────────────── */}
      <div className="p-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          id="new-conversation-btn"
          onClick={() => { onNewConversation(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium
                     transition-all duration-200 group relative overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#94a3b8',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(37,99,235,0.10)'
            e.currentTarget.style.borderColor = 'rgba(37,99,235,0.25)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = '#94a3b8'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          New analysis
        </button>
      </div>

      {/* ── Data sources ───────────────────────────────────────────────────── */}
      <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-widest">
            Data sources
          </span>
          <button
            id="add-connection-btn"
            disabled={connectionSetupDisabled}
            onClick={() => setShowConnModal(true)}
            className="text-xs text-slate-500 hover:text-slate-200 font-semibold px-2 py-0.5
                       rounded hover:bg-white/[0.06] transition-colors"
            title="Add database connection"
          >
            + Add
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-lg">🎵</span>
            <span className="text-xs text-slate-600">Chinook demo database</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {connections.map((c) => {
              const dotColor =
                c.status === 'connected'  ? '#4ade80'
                : c.status === 'untested' ? '#fbbf24'
                : '#f87171'
              return (
                <div key={c.id}
                  className="group flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span className="flex-1 text-xs text-slate-400 truncate">{c.name}</span>
                  <button disabled={connectionSetupDisabled} onClick={() => setReferenceConnection(c)} title="Reference files" aria-label={`Reference files for ${c.name}`} className="p-1 text-slate-400 hover:text-blue-300"><FileText size={14} /></button>
                  <button
                    onClick={() => deleteConnMutation.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center
                               justify-center text-slate-600 hover:text-red-400 transition-all rounded"
                    title="Remove connection"
                  >×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Conversation list ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.5" className="text-slate-700">
                <path strokeLinecap="round" strokeLinejoin="round"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-slate-700 text-xs text-center">No conversations yet</p>
          </div>
        ) : (
          <AnimatePresence>
            {grouped.map(({ label, items }) => (
              <div key={label}>
                {/* Group label */}
                <p className="text-[10px] text-slate-700 font-semibold uppercase tracking-widest
                               px-2 py-1.5 mt-1 first:mt-0">
                  {label}
                </p>

                {items.map((convo) => (
                  <motion.div
                    key={convo.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    className={`group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer
                                transition-all duration-150 text-sm min-h-[38px] ${
                      activeConversationId === convo.id
                        ? 'sidebar-item-active'
                        : 'text-slate-500 hover:text-slate-200'
                    }`}
                    style={activeConversationId !== convo.id ? undefined : undefined}
                    onClick={() => {
                      if (editingId !== convo.id) {
                        onSelectConversation(convo.id, convo.connection_id ?? null)
                        onClose()
                      }
                    }}
                  >
                    {/* Chat icon */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                         strokeWidth="1.8" className="flex-shrink-0 opacity-30">
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>

                    {/* Title / edit input */}
                    {editingId === convo.id ? (
                      <input
                        className="flex-1 bg-surface-850 border border-accent-500/60 text-white
                                   text-xs px-2 py-0.5 rounded-md focus:outline-none min-w-0"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRenameSubmit(convo.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit(convo.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate min-w-0 text-xs">{convo.title}</span>
                    )}

                    {/* Timestamp + action buttons */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {/* Timestamp — visible by default, hidden when hovering for actions */}
                      <span className="text-[10px] text-slate-700 group-hover:hidden">
                        {relativeTime(convo.updated_at)}
                      </span>
                      {/* Action buttons — hidden by default, shown on hover */}
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRenameStart(convo) }}
                          className="w-5 h-5 flex items-center justify-center rounded
                                     text-slate-600 hover:text-slate-300 hover:bg-white/[0.08] transition-colors"
                          title="Rename"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(convo.id) }}
                          className="w-5 h-5 flex items-center justify-center rounded
                                     text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 p-3"
           style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {/* User info */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1
                        hover:bg-white/[0.03] transition-colors cursor-default">
          <div
            className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                       text-xs font-bold text-white ring-1 ring-white/10"
            style={{ background: `linear-gradient(135deg, ${avatarFrom}, ${avatarTo})` }}
          >
            {user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate leading-tight">{user?.username}</p>
            <p className="text-[10px] text-slate-600 truncate leading-tight">{user?.email}</p>
          </div>
        </div>

        {/* Settings + Logout */}
        <div className="flex items-center gap-1 px-1">
          <button
            onClick={() => { navigate('/settings'); onClose() }}
            className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                       text-slate-600 hover:text-slate-200 hover:bg-white/[0.05]
                       text-xs font-medium transition-colors"
            title="Settings"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg
                       text-slate-600 hover:text-red-400 hover:bg-red-500/[0.08]
                       text-xs font-medium transition-colors"
            title="Sign out"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {referenceConnection && <ReferenceManager connectionId={referenceConnection.id} name={referenceConnection.name} onClose={() => setReferenceConnection(null)} />}
      {showConnModal && (
        <ConnectionModal
          onClose={() => setShowConnModal(false)}
          onSaved={(connection) => {
            onConnectionReady?.(connection)
            onClose()
            queryClient.invalidateQueries({ queryKey: ['connections'] })
            setShowConnModal(false)
          }}
        />
      )}

      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.aside
            key="desktop-sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="hidden md:flex flex-col h-dvh flex-shrink-0 overflow-hidden relative"
            style={{ borderRight: '1px solid var(--border-subtle)', minWidth: 0 }}
          >
            <div style={{ width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }} className="h-full flex flex-col">
              {sidebarContent}
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={onMouseDown}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10
                         transition-colors hover:bg-blue-500/30"
              title="Drag to resize"
            >
              <div className="absolute inset-y-0 right-0 w-4 -translate-x-1.5" />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed left-0 top-0 bottom-0 w-72 z-40 flex flex-col"
            style={{ borderRight: '1px solid var(--border-subtle)' }}
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
