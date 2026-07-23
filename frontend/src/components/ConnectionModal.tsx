import { useState, useEffect, useRef } from 'react'
import { connectionsApi, type ConnectionCreate, type UserConnection } from '../lib/api'

interface Props {
  onClose: () => void
  onSaved: (conn: UserConnection) => void
}

const STATUS_MESSAGES: Record<string, { label: string; color: string }> = {
  connected:   { label: '✓ Connected successfully',          color: '#4ade80' },
  unreachable: { label: '✗ Host unreachable or timed out',   color: '#f87171' },
  auth_failed: { label: '✗ Authentication failed',           color: '#f87171' },
  untested:    { label: '⚠ Connection saved (not verified)', color: '#fbbf24' },
}

export default function ConnectionModal({ onClose, onSaved }: Props) {
  const [form, setForm] = useState<ConnectionCreate>({
    name: '',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedConn, setSavedConn] = useState<UserConnection | null>(null)
  const mountedRef = useRef(true)

  // Track mounted state so async callbacks don't update state after unmount
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  function update(field: keyof ConnectionCreate, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const conn = await connectionsApi.create(form)
      if (!mountedRef.current) return
      setSavedConn(conn)
      if (conn.status === 'connected') {
        // Auto-close after 1s on success, but only if still mounted
        setTimeout(() => {
          if (mountedRef.current) onSaved(conn)
        }, 1000)
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return
      // detail can be a string (app error) or an array (Pydantic validation errors)
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      let msg: string
      if (Array.isArray(detail)) {
        // Pydantic returns [{loc, msg, type}, ...]
        msg = detail.map((d: { msg?: string }) => d?.msg ?? String(d)).join('; ')
      } else if (typeof detail === 'string') {
        msg = detail
      } else {
        msg = 'Failed to save connection'
      }
      setError(msg)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }

  const statusInfo = savedConn ? STATUS_MESSAGES[savedConn.status] ?? null : null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--bg-secondary, #0f172a)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          borderRadius: '16px',
          padding: '28px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary, #e0e0e0)' }}>
            🔗 Connect Your Database
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary, #aaa)', fontSize: '1.4rem', lineHeight: 1,
              padding: '2px 6px', borderRadius: '6px',
            }}
          >×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label="Connection Name" id="conn-name">
            <input id="conn-name" type="text" required placeholder="e.g. My Production DB"
              value={form.name} onChange={(e) => update('name', e.target.value)}
              style={inputStyle} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px' }}>
            <Field label="Host" id="conn-host">
              <input id="conn-host" type="text" required placeholder="db.example.com"
                value={form.host} onChange={(e) => update('host', e.target.value)}
                style={inputStyle} />
            </Field>
            <Field label="Port" id="conn-port">
              <input id="conn-port" type="number" required min={1} max={65535}
                value={form.port} onChange={(e) => update('port', parseInt(e.target.value) || 5432)}
                style={inputStyle} />
            </Field>
          </div>

          <Field label="Database" id="conn-db">
            <input id="conn-db" type="text" required placeholder="mydb"
              value={form.database} onChange={(e) => update('database', e.target.value)}
              style={inputStyle} />
          </Field>

          <Field label="Username" id="conn-user">
            <input id="conn-user" type="text" required placeholder="readonly_user"
              value={form.username} onChange={(e) => update('username', e.target.value)}
              style={inputStyle} />
          </Field>

          <Field label="Password" id="conn-pass">
            <input id="conn-pass" type="password" required
              value={form.password} onChange={(e) => update('password', e.target.value)}
              style={inputStyle} />
          </Field>

          {error && (
            <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: '8px', padding: '10px 12px', fontSize: '0.84rem', color: '#f87171' }}>
              {error}
            </div>
          )}

          {statusInfo && (
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px',
              padding: '10px 12px', fontSize: '0.84rem', color: statusInfo.color,
              border: `1px solid ${statusInfo.color}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{statusInfo.label}</span>
              {savedConn?.status !== 'connected' && (
                <button type="button" onClick={() => onSaved(savedConn!)}
                  style={{ background: 'none', border: 'none',
                    cursor: 'pointer', color: '#60a5fa', fontSize: '0.82rem',
                    textDecoration: 'underline', padding: 0 }}>
                  Use anyway
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button type="button" onClick={onClose}
              style={{ ...btnBase, flex: 1, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary, #aaa)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ ...btnBase, flex: 2, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Testing & Saving…' : 'Test & Save Connection'}
            </button>
          </div>
        </form>

        <p style={{ margin: '14px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary, #888)', textAlign: 'center' }}>
          Credentials are encrypted at rest. All queries run read-only.
        </p>
      </div>
    </div>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '4px',
        fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary, #aaa)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '0.9rem',
  color: 'var(--text-primary, #e0e0e0)',
  outline: 'none',
}

const btnBase: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '0.88rem',
  fontWeight: 600,
  transition: 'opacity 0.15s',
}
