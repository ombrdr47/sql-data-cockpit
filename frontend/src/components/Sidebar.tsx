/**
 * components/Sidebar.tsx
 * Conversation history sidebar.
 * Features:
 *  - Resizable width via drag handle (desktop)
 *  - Collapsible (hide/show) on desktop via toggle button
 *  - Clean user profile footer with avatar, name, email, settings + logout
 *  - Conversation items: delete button sits in its own padded cell, never overlaps text
 *  - Mobile drawer unchanged
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { connectionsApi, type UserConnection } from '../lib/api'
import { useAuth } from '../lib/auth'
import ConnectionModal from './ConnectionModal'

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
}

interface SidebarProps {
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  isOpen: boolean
  onClose: () => void
  // Desktop collapse state (controlled by parent)
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const MIN_WIDTH = 200
const MAX_WIDTH = 480
const DEFAULT_WIDTH = 240

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editTitle, setEditTitle]         = useState('')
  const [showConnModal, setShowConnModal] = useState(false)
  const [width, setWidth]                 = useState(DEFAULT_WIDTH)
  const isDragging = useRef(false)
  const startX    = useRef(0)
  const startW    = useRef(DEFAULT_WIDTH)

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
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta))
      setWidth(newW)
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
    mutationFn: async (id: string) => {
      await api.delete(`/conversations/${id}`)
    },
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
    if (editTitle.trim()) {
      renameMutation.mutate({ id, title: editTitle.trim() })
    } else {
      setEditingId(null)
    }
  }

  // ── Sidebar content ────────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="flex flex-col h-full select-none bg-surface-900">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-accent-600 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm">SQL Cockpit</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Desktop collapse / hide button */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="hidden md:flex w-7 h-7 items-center justify-center rounded-lg
                         text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
              title="Hide sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7"/>
              </svg>
            </button>
          )}
          {/* Mobile close */}
          <button
            onClick={onClose}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg
                       text-slate-500 hover:text-slate-200 hover:bg-white/[0.05] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── New chat ───────────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-white/[0.07] flex-shrink-0">
        <button
          id="new-conversation-btn"
          onClick={() => { onNewConversation(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg
                     bg-white/[0.06] hover:bg-white/[0.09]
                     border border-white/[0.09] hover:border-white/[0.14]
                     text-slate-300 hover:text-white text-sm font-medium
                     transition-colors duration-150"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      {/* ── Data sources ──────────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-b border-white/[0.05] flex-shrink-0">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
            Data sources
          </span>
          <button
            id="add-connection-btn"
            onClick={() => setShowConnModal(true)}
            className="text-xs text-slate-400 hover:text-slate-200 font-semibold px-2 py-0.5
                       rounded hover:bg-white/[0.06] transition-colors"
            title="Add database connection"
          >
            + Add
          </button>
        </div>

        {connections.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="text-lg">🎵</span>
            <span className="text-xs text-slate-500">Chinook demo database</span>
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
                  className="group flex items-center gap-2.5 px-2 py-2 rounded-xl
                             hover:bg-white/[0.05] transition-colors"
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span className="flex-1 text-sm text-slate-300 truncate">{c.name}</span>
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

      {/* ── Conversation list ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest px-1 mb-2.5">
          History
        </p>

        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.06]
                            flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.5" className="text-slate-600">
                <path strokeLinecap="round" strokeLinejoin="round"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0
                         01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0
                         01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0
                         006.586 13H4" />
              </svg>
            </div>
            <p className="text-slate-600 text-xs text-center">No conversations yet</p>
          </div>
        ) : (
          <AnimatePresence>
            {conversations.map((convo) => (
              <motion.div
                key={convo.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className={`group flex items-center gap-2 rounded-xl px-2 py-2 cursor-pointer
                            transition-all duration-150 text-sm min-h-[40px] ${
                  activeConversationId === convo.id
                    ? 'sidebar-item-active'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
                onClick={() => {
                  if (editingId !== convo.id) {
                    onSelectConversation(convo.id)
                    onClose()
                  }
                }}
              >
                {/* Chat icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="1.8" className="flex-shrink-0 opacity-40">
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863
                           0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418
                           4.03-8 9-8s9 3.582 9 8z" />
                </svg>

                {/* Title / edit input — takes remaining space */}
                {editingId === convo.id ? (
                  <input
                    className="flex-1 bg-surface-850 border border-accent-500/60 text-white
                               text-sm px-2 py-0.5 rounded-md focus:outline-none min-w-0"
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
                  <span className="flex-1 truncate min-w-0">{convo.title}</span>
                )}

                {/* Action buttons — fixed width cell so they never overlap text */}
                <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRenameStart(convo) }}
                    className="w-6 h-6 flex items-center justify-center rounded
                               text-slate-500 hover:text-slate-300 hover:bg-white/[0.08] transition-colors"
                    title="Rename"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2
                               2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(convo.id) }}
                    className="w-6 h-6 flex items-center justify-center rounded
                               text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5
                               7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* ── User footer ───────────────────────────────────────────────────── */}
      <div className="p-3 border-t border-white/[0.06] flex-shrink-0 bg-surface-900">
        {/* User info row */}
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors mb-1">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                          text-xs font-bold text-white bg-gradient-to-br from-accent-600 to-violet-700 ring-1 ring-white/10">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate leading-tight">{user?.username}</p>
            <p className="text-[11px] text-slate-500 truncate leading-tight">{user?.email}</p>
          </div>
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-1 px-1 mt-1">
          <button
            onClick={() => { navigate('/settings'); onClose() }}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg
                       text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]
                       text-xs font-medium transition-colors"
            title="Settings"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94
                       3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724
                       1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572
                       1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31
                       -.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724
                       1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07
                       2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                       text-slate-400 hover:text-red-400 hover:bg-red-500/10
                       text-xs font-medium transition-colors"
            title="Sign out"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
      {showConnModal && (
        <ConnectionModal
          onClose={() => setShowConnModal(false)}
          onSaved={() => {
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
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
            className="hidden md:flex flex-col border-r border-white/[0.07] h-dvh flex-shrink-0
                       bg-surface-900 overflow-hidden relative"
            style={{ minWidth: 0 }}
          >
            <div style={{ width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }} className="h-full flex flex-col">
              {sidebarContent}
            </div>

            {/* Drag handle */}
            <div
              onMouseDown={onMouseDown}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10
                         hover:bg-accent-500/40 transition-colors group"
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
            className="md:hidden fixed left-0 top-0 bottom-0 w-72 bg-surface-900
                       border-r border-white/[0.06] z-40 flex flex-col"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
