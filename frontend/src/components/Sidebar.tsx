/**
 * components/Sidebar.tsx
 * Conversation history sidebar — restyled per UI.md.
 * All logic (mutations, rename, delete, connections) preserved verbatim.
 */
import { useState } from 'react'
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
}

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  isOpen,
  onClose,
}: SidebarProps) {
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editTitle, setEditTitle]     = useState('')
  const [showConnModal, setShowConnModal] = useState(false)

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

  const sidebarContent = (
    <div className="flex flex-col h-full select-none"
         style={{ background: 'var(--bg-sidebar)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-accent flex items-center justify-center flex-shrink-0 shadow-glow-sm">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm tracking-tight">SQL Cockpit</span>
        </div>
        {/* Mobile close */}
        <button
          onClick={onClose}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg
                     text-slate-500 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New chat */}
      <div className="p-3 border-b border-white/[0.05] flex-shrink-0">
        <button
          id="new-conversation-btn"
          onClick={() => { onNewConversation(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl
                     bg-gradient-to-r from-accent-500/20 to-accent-600/10
                     hover:from-accent-500/30 hover:to-accent-600/20
                     border border-accent-500/20 hover:border-accent-500/35
                     text-accent-300 hover:text-accent-200 text-sm font-medium
                     transition-all duration-200 active:scale-[0.97]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Connections */}
      <div className="px-3 py-3 border-b border-white/[0.05] flex-shrink-0">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">
            Data sources
          </span>
          <button
            id="add-connection-btn"
            onClick={() => setShowConnModal(true)}
            className="text-xs text-accent-400 hover:text-accent-300 font-semibold px-2 py-0.5
                       rounded-md hover:bg-accent-500/10 transition-colors"
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
                c.status === 'connected'   ? '#4ade80'
                : c.status === 'untested'  ? '#fbbf24'
                : '#f87171'
              return (
                <div key={c.id}
                  className="group flex items-center gap-2.5 px-2 py-2 rounded-xl
                             hover:bg-white/[0.05] transition-colors"
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: dotColor,
                    flexShrink: 0, boxShadow: `0 0 6px ${dotColor}88`
                  }} />
                  <span className="flex-1 text-sm text-slate-300 truncate">{c.name}</span>
                  <button
                    onClick={() => deleteConnMutation.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center
                               text-slate-600 hover:text-red-400 transition-all rounded"
                    title="Remove connection"
                  >×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Conversation list */}
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
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586
                         a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293
                         l-2.414-2.414A1 1 0 006.586 13H4" />
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
                className={`group relative rounded-xl px-3 py-2.5 flex items-center gap-2
                            cursor-pointer transition-all duration-150 text-sm min-h-[44px] ${
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
                     strokeWidth="1.8" className="flex-shrink-0 opacity-50">
                  <path strokeLinecap="round" strokeLinejoin="round"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0
                           01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8
                           9-8s9 3.582 9 8z" />
                </svg>

                {editingId === convo.id ? (
                  <input
                    className="flex-1 bg-surface-850 border border-accent-500/60 text-white
                               text-sm px-2 py-0.5 rounded-md focus:outline-none"
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
                  <span className="flex-1 truncate">{convo.title}</span>
                )}

                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex
                                items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRenameStart(convo) }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500
                               hover:text-slate-300 transition-colors"
                    title="Rename"
                  >✎</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(convo.id) }}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500
                               hover:text-red-400 transition-colors"
                    title="Delete"
                  >×</button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* User / logout */}
      <div className="p-3 border-t border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2.5 px-1">
          {/* Avatar — gradient circle */}
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center
                          text-xs font-bold text-white"
               style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.username}</p>
            <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
          </div>
          {/* Logout */}
          <button
            onClick={logout}
            className="w-7 h-7 flex items-center justify-center rounded-lg
                       text-slate-500 hover:text-red-400 hover:bg-red-500/10
                       transition-all duration-150"
            title="Sign out"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
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

      {/* Desktop sidebar — glass background */}
      <aside className="hidden md:flex md:w-64 flex-col border-r border-white/[0.06] h-dvh flex-shrink-0"
             style={{ background: 'var(--bg-sidebar)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        {sidebarContent}
      </aside>

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
