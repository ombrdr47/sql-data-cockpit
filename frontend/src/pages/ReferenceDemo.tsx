import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ReferenceFiles } from '../components/ReferenceFiles'
import BrandMark from '../components/BrandMark'
import type { ReferenceFile } from '../lib/api'
import '../connections.css'

export default function ReferenceDemo() {
  const [files, setFiles] = useState<ReferenceFile[]>([])
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  return <main style={{ minHeight: '100dvh', background: '#101720', color: '#dce6f4', padding: '32px 18px' }}>
    <div style={{ maxWidth: 660, margin: '0 auto' }}>
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 28 }}><BrandMark />SQL Cockpit</Link>
      <p className="explore-eyebrow">INTERACTIVE DEMO · NO DATABASE REQUIRED</p>
      <h1 style={{ fontSize: 30, margin: '12px 0', letterSpacing: '-1px' }}>Give your database a little context.</h1>
      <p style={{ fontSize: 14, lineHeight: 1.8, color: '#adbed4' }}>Try the same optional reference editor used during connection setup. Load the fictional examples, expand each file to inspect it, or remove them to return to schema-only mode.</p>
      <p style={{ fontSize: 12, lineHeight: 1.8, color: '#a8ccb9', margin: '18px 0' }}>This demo keeps files only in this page’s memory. It does not save them to a connection, send them to an AI provider, or run queries. Refreshing clears them.</p>
      <button className="connection-primary" disabled={busy || reading} onClick={async () => {
        setBusy(true); setError('')
        try {
          const names = ['data-dictionary.md', 'business-glossary.md', 'example-questions.sql']
          const examples = await Promise.all(names.map(async name => {
            const response = await fetch(`/reference-examples/${name}`)
            if (!response.ok) throw Error('Could not load the examples. Try again.')
            return { name, content: await response.text() }
          }))
          setFiles(examples)
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not load examples.') }
        finally { setBusy(false) }
      }}>{busy ? 'Loading…' : 'Load the three demo files'}</button>
      {error && <p role="alert" className="connection-error">{error}</p>}
      <ReferenceFiles previewOnly files={files} onChange={setFiles} disabled={busy} onReading={setReading} />
      <p role="status" style={{ fontSize: 13, color: '#b9cbe4', marginBottom: 20 }}>{files.length ? `${files.length} reference files selected for this preview.` : 'No references selected. In the real app, you can still connect and query using the database schema.'}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><button className="connection-secondary" disabled={busy || reading || !files.length} onClick={() => setFiles([])}>Remove all files</button><Link className="connection-secondary" to="/login">Go to the real workspace →</Link></div>
      <p style={{ fontSize: 12, color: '#9daec4', lineHeight: 1.8, marginTop: 22 }}>In a personal workspace: Data sources → + Add → optional reference files. For an existing connection, use the file icon beside its name. The shared demo account cannot add database connections.</p>
    </div>
  </main>
}
