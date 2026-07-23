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
    <div className="flex flex-col h-full bg-surface-900 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white text-sm tracking-tight">SQL Cockpit</span>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5 md:hidden text-slate-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* New chat */}
      <div className="p-3 border-b border-white/[0.05]">
        <button
          id="new-conversation-btn"
          onClick={() => { onNewConversation(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg
                     bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08]
                     text-slate-200 text-sm font-medium transition-all duration-150 active:scale-[0.98]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          New conversation
        </button>
      </div>

      {/* Connections */}
      <div className="px-3 py-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Data sources
          </span>
          <button
            id="add-connection-btn"
            onClick={() => setShowConnModal(true)}
            className="text-xs text-accent-400 hover:text-accent-300 font-medium px-2 py-0.5
                       rounded hover:bg-accent-500/10 transition-colors"
            title="Add database connection"
          >
            + Add
          </button>
        </div>

        {connections.length === 0 ? (
          <p className="text-slate-600 text-xs px-1 py-1">
            Using Chinook demo
          </p>
        ) : (
          <div className="space-y-1">
            {connections.map((c) => {
              const dotColor =
                c.status === 'connected'   ? '#4ade80'
                : c.status === 'untested'  ? '#fbbf24'
                : '#f87171'
              return (
                <div key={c.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg
                             hover:bg-white/[0.05] transition-colors"
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor,
                    flexShrink: 0 }} />
                  <span className="flex-1 text-sm text-slate-300 truncate">{c.name}</span>
                  <button
                    onClick={() => deleteConnMutation.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400
                               transition-all text-base leading-none px-1"
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
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider px-1 mb-2">
          History
        </p>

        {conversations.length === 0 ? (
          <p className="text-slate-600 text-sm px-1 py-4 text-center">
            No conversations yet
          </p>
        ) : (
          <AnimatePresence>
            {conversations.map((convo) => (
              <motion.div
                key={convo.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className={`group relative rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer
                            transition-colors text-sm ${
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
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                    title="Rename"
                  >✎</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(convo.id) }}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >×</button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* User / logout */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-accent-500/20 border border-accent-500/30 rounded-full
                            flex items-center justify-center text-xs font-semibold text-accent-300 flex-shrink-0">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.username}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-md hover:bg-white/[0.06] text-slate-500
                       hover:text-red-400 transition-colors text-xs"
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

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 flex-col bg-surface-900 border-r border-white/[0.06] h-screen flex-shrink-0">
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
