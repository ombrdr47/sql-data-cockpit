import { useState, useEffect, useRef, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Database, X, Eye, EyeOff, ArrowRight, CheckCircle2, AlertCircle, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { connectionsApi, type ConnectionCreate, type UserConnection } from '../lib/api'
import { useAuth } from '../lib/auth'
import '../connections.css'
import { ReferenceFiles } from './ReferenceFiles'

interface Props {
  onClose: () => void
  onSaved: (conn: UserConnection) => void
}
const failures: Record<string, string> = {
  unreachable: 'Check the host and port, confirm the database is running, and allow connections from this app’s server in your database network settings.',
  auth_failed: 'The database rejected these credentials. Check the username and password. You can update the saved password in Settings.',
  untested: 'This connection has not been verified yet. Retry the connection test before using it.',
}
export default function ConnectionModal({ onClose, onSaved }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isDemo = user?.role === 'sample_guest' || user?.email === 'demo@chinook.dev'
  const [form, setForm] = useState<ConnectionCreate>({ name: '', host: '', port: 5432, database: '', username: '', password: '' })
  const [port, setPort] = useState('5432')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [readingReferences, setReadingReferences] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedConn, setSavedConn] = useState<UserConnection | null>(null)
  const mounted = useRef(true)
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef(false)
  useEffect(() => {
    mounted.current = true
    dialog.current?.showModal()
    return () => { mounted.current = false }
  }, [])
  function update(field: keyof ConnectionCreate, value: string) {
    setForm(f => ({ ...f, [field]: value })); setError(null)
  }
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (pending.current || readingReferences) return
    const payload = { ...form, name: form.name.trim(), host: form.host.trim(), database: form.database.trim(), username: form.username.trim(), port: Number(port) }
    if (!savedConn && (!payload.name || !payload.host || !payload.database || !payload.username)) {
      setError('Enter a connection name, host, database, and username.'); return
    }
    if (!savedConn && (payload.host.includes('://') || payload.host.includes('/'))) {
      setError('Enter only the hostname, such as db.example.com. Put the port, database, and credentials in their own fields.'); return
    }
    pending.current = true; setLoading(true); setError(null)
    try {
      const conn = savedConn ? await connectionsApi.test(savedConn.id) : await connectionsApi.create(payload)
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
      if (mounted.current) setSavedConn(conn)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      const message = Array.isArray(detail) ? detail.map((d: { msg?: string }) => d.msg ?? 'Invalid field').join('; ') : typeof detail === 'string' ? detail : 'We couldn’t complete the request. Check your connection and try again.'
      if (mounted.current) setError(message)
    } finally { pending.current = false; if (mounted.current) setLoading(false) }
  }
  const connected = savedConn?.status === 'connected'
  return <dialog ref={dialog} className="connection-dialog" aria-labelledby="connection-title" onCancel={e => { e.preventDefault(); if (!loading) onClose() }}>
    <header><div className="connection-heading-icon"><Database size={22} /></div><div><span>DATA SOURCES / POSTGRESQL</span><h2 id="connection-title">{savedConn ? connected ? 'Your database is connected.' : 'Saved, but not connected yet.' : 'Bring your data into focus.'}</h2></div><button type="button" aria-label="Close connection setup" disabled={loading} onClick={onClose}><X size={20} /></button></header>
    {isDemo ? <div className="connection-demo"><Database size={32} /><h3>A personal workspace for your database.</h3><p>You’re using a Chinook sample workspace. Create a personal account to connect your own PostgreSQL database. The Chinook sample is ready to explore here.</p><Link className="connection-primary" to="/signup" onClick={onClose}>Create a personal account <ArrowRight size={16} /></Link><button className="connection-secondary" onClick={onClose}>Keep exploring the sample</button></div>
    : savedConn ? <div className="connection-outcome">
      <div className={connected ? 'connection-feedback success' : 'connection-feedback'} role="status">{connected ? <CheckCircle2 size={23} /> : <AlertCircle size={23} />}<div><h3>{connected ? 'Connection test passed' : 'Connection test needs attention'}</h3><p>{connected ? 'Open a new analysis with this data source selected. You’ll review each generated query before it runs.' : failures[savedConn.status] ?? 'The test did not succeed. Review the saved connection in Settings, then try again.'}</p></div></div>
      <dl><div><dt>Connection</dt><dd>{savedConn.name}</dd></div><div><dt>Host</dt><dd>{savedConn.host_masked}:{savedConn.port}</dd></div><div><dt>Database</dt><dd>{savedConn.database_masked}</dd></div></dl>
      {!connected && <p className="connection-help">This connection is already saved. Retrying tests the same connection. Manage its credentials or remove it in Settings.</p>}
      {error && <p className="connection-error" role="alert">{error}</p>}
      <footer>{connected ? <><button className="connection-secondary" onClick={onClose}>Done</button><button className="connection-primary" onClick={() => onSaved(savedConn)}>Open analysis <ArrowRight size={16} /></button></> : <><Link className="connection-secondary" to="/settings" onClick={onClose}>Manage in Settings</Link><button className="connection-primary" disabled={loading} onClick={() => void submit()}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}{loading ? 'Testing connection…' : 'Retry connection test'}</button></>}</footer>
    </div> : <form onSubmit={submit} className="connection-form">
      <p className="connection-intro">Connect a public PostgreSQL database with verified TLS and a dedicated read-only user. Grant it access only to tables this workspace should query.</p>
      <p className="connection-intro">We discover schema without sampling rows. Your questions, schema, reference files, and approved query results are sent to the model provider. Query results and conversation context are stored in your workspace.</p>
      <fieldset disabled={loading}><legend>01 / CONNECTION DETAILS</legend>
        <label htmlFor="conn-name">Connection name<input id="conn-name" autoFocus required maxLength={100} value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Sales analytics" /><small>A recognizable name for your workspace.</small></label>
        <div className="connection-host-row"><label htmlFor="conn-host">Host<input id="conn-host" required autoCapitalize="none" spellCheck={false} value={form.host} onChange={e => update('host', e.target.value)} placeholder="db.example.com" aria-describedby="conn-host-help" /></label><label htmlFor="conn-port">Port<input id="conn-port" required type="number" min={1} max={65535} value={port} onChange={e => setPort(e.target.value)} /></label></div>
        <p id="conn-host-help" className="connection-help">Use the hostname only. Localhost and private network addresses are not supported by this app.</p>
        <label htmlFor="conn-db">Database name<input id="conn-db" required autoCapitalize="none" spellCheck={false} value={form.database} onChange={e => update('database', e.target.value)} placeholder="analytics" /></label>
      </fieldset>
      <fieldset disabled={loading}><legend>02 / DATABASE CREDENTIALS</legend><div className="connection-credentials"><label htmlFor="conn-user">Username<input id="conn-user" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={form.username} onChange={e => update('username', e.target.value)} placeholder="readonly_user" /></label><label htmlFor="conn-pass">Password<span className="connection-password"><input id="conn-pass" required type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={e => update('password', e.target.value)} /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide database password' : 'Show database password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label></div></fieldset>
      <ReferenceFiles files={form.references?.files ?? []} onChange={files => setForm(f => ({ ...f, references: { files } }))} disabled={loading} onReading={setReadingReferences} />
      <div className="connection-privacy"><ShieldCheck size={17} /><p>Credentials are encrypted at rest. Schema, conversation context, and query results may be sent to Groq when you analyze your data.</p></div>
      {error && <p className="connection-error" role="alert">{error}</p>}
      <footer><span role="status">{loading ? 'Checking access and saving your connection…' : 'Connection details are saved even if the test fails.'}</span><div><button type="button" className="connection-secondary" disabled={loading} onClick={onClose}>Cancel</button><button className="connection-primary" disabled={loading || readingReferences}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}{loading ? 'Testing & saving…' : 'Test & save connection'}</button></div></footer>
    </form>}
  </dialog>
}
