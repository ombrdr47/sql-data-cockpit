/**
 * components/Sidebar.tsx
 * Conversation history sidebar (ChatGPT-style).
 * Features: list, rename (inline edit), delete, new conversation button.
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
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
      if (activeConversationId === id) {
        onNewConversation()
      }
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
    <div className="flex flex-col h-full bg-surface-950 font-mono text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-surface-900/50">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 bg-brand-500 rounded flex items-center justify-center text-surface-950 font-bold text-xs shadow-[0_0_10px_rgba(255,107,0,0.4)]">
            SQL
          </div>
          <span className="font-bold tracking-tight text-white uppercase">
            Data Cockpit <span className="text-brand-500 text-[10px]">v2.0</span>
          </span>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5 md:hidden">
          <span>[×]</span>
        </button>
      </div>

      {/* New chat button */}
      <div className="p-3 border-b border-slate-800/80">
        <button
          id="new-conversation-btn"
          onClick={() => { onNewConversation(); onClose() }}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded
                     bg-brand-500 hover:bg-brand-400 text-surface-950 font-bold text-xs uppercase tracking-wider
                     transition-all duration-150 shadow-[0_0_10px_rgba(255,107,0,0.2)] active:scale-95"
        >
          <span>[+ NEW_TRANSACTION]</span>
          <span>⚡</span>
        </button>
      </div>

      {/* Connections section */}
      <div className="px-2 py-2 border-b border-slate-800/80">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            // DB_CONNECTIONS
          </span>
          <button
            id="add-connection-btn"
            onClick={() => setShowConnModal(true)}
            className="text-[10px] text-brand-400 hover:text-brand-300 font-bold px-1 py-0.5 rounded hover:bg-brand-500/10 transition-colors"
            title="Add database connection"
          >
            [+ ADD]
          </button>
        </div>
        {connections.length === 0 ? (
          <p className="text-slate-600 text-[10px] px-2 py-1">
            No connections — using Chinook demo
          </p>
        ) : (
          <div className="space-y-1">
            {connections.map((c) => {
              const dotColor =
                c.status === 'connected' ? '#4ade80'
                : c.status === 'untested' ? '#fbbf24'
                : '#f87171'
              return (
                <div key={c.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded border border-transparent hover:bg-surface-900 hover:border-slate-800"
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor,
                    flexShrink: 0, boxShadow: `0 0 5px ${dotColor}88` }} />
                  <span className="flex-1 text-[11px] text-slate-300 truncate font-mono">{c.name}</span>
                  <button
                    onClick={() => deleteConnMutation.mutate(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 p-0.5 transition-all text-xs"
                    title="Remove connection"
                  >×</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        <div className="text-[10px] text-slate-500 px-2 py-1 uppercase tracking-widest font-bold">
          // SESSION_AUDIT_LOGS
        </div>
        {conversations.length === 0 ? (
          <p className="text-slate-600 text-xs px-2 py-6 text-center">
            [NO_TRANSACTIONS]<br />Execute prompt to log session.
          </p>
        ) : (
          <AnimatePresence>
            {conversations.map((convo) => (
              <motion.div
                key={convo.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className={`group relative rounded px-2.5 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  activeConversationId === convo.id
                    ? 'bg-brand-950/40 text-brand-400 border border-brand-500/40 shadow-[inset_2px_0_0_#ff6b00]'
                    : 'text-slate-400 hover:bg-surface-900 hover:text-slate-200 border border-transparent'
                }`}
                onClick={() => {
                  if (editingId !== convo.id) {
                    onSelectConversation(convo.id)
                    onClose()
                  }
                }}
              >
                <span className="text-[10px] text-slate-600 font-bold">#</span>

                {editingId === convo.id ? (
                  <input
                    className="flex-1 bg-surface-900 border border-brand-500 text-white text-xs px-2 py-0.5 rounded focus:outline-none"
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
                  <span className="flex-1 truncate text-xs font-mono">{convo.title}</span>
                )}

                {/* Action buttons (show on hover) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-surface-900 px-1 rounded border border-slate-800">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRenameStart(convo) }}
                    className="p-1 hover:text-white"
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(convo.id) }}
                    className="p-1 hover:text-red-400"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* User info / Logout */}
      <div className="p-3 border-t border-slate-800 bg-surface-900/50">
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 bg-brand-500 text-surface-950 font-bold rounded flex items-center justify-center text-xs">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-200 truncate">{user?.username}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded hover:bg-surface-800 text-slate-500 hover:text-red-400 transition-colors font-bold text-xs"
            title="Logout"
          >
            [LOGOUT]
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
      <aside className="hidden md:flex md:w-64 flex-col bg-surface-900 border-r border-white/5 h-screen flex-shrink-0">
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
            className="md:hidden fixed left-0 top-0 bottom-0 w-72 bg-surface-900 border-r border-white/5 z-40 flex flex-col"
          >
            {sidebarContent}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
