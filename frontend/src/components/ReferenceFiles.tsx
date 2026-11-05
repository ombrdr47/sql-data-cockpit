import { useEffect, useRef, useState } from 'react'
import { FileText, X } from 'lucide-react'
import { connectionsApi, type ReferenceFile } from '../lib/api'
import { authError } from '../lib/authError'
import '../references.css'

export function ReferenceFiles({ files, onChange, disabled = false, onReading, previewOnly = false }: { files: ReferenceFile[]; onChange: (files: ReferenceFile[]) => void; disabled?: boolean; previewOnly?: boolean; onReading?: (busy: boolean) => void }) {
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  return <section className="reference-files" aria-label="Optional database reference files">
    <div className="reference-title"><FileText size={18} /><h3>Help the assistant understand your data</h3><span>Optional</span></div>
    <p>Connect with schema alone, or add a data dictionary, business definitions, and reviewed query examples to clarify unfamiliar names. Accuracy still depends on your schema and definitions.</p>
    <div className="reference-examples"><span>Download fictional examples:</span>{[['data-dictionary.txt', 'Table descriptions'], ['business-glossary.txt', 'Business terms'], ['example-questions.sql', 'Questions & SQL']].map(([file, label]) => <a key={file} href={`/reference-examples/${file}`} download>{label} ↗</a>)}</div>
    <label className="reference-upload">Add reference files<input ref={input} type="file" multiple accept=".txt,.md,.csv,.json,.sql" disabled={disabled || reading} onChange={async e => {
      const selected = Array.from(e.target.files ?? [])
      setError(''); setReading(true); onReading?.(true)
      try {
        if (files.length + selected.length > 3) throw Error('Choose up to three files in total.')
        if (selected.some(file => file.size > 24000)) throw Error('Files must total 24 KB or less.')
        const additions: ReferenceFile[] = []
        for (const file of selected) {
          if (!/\.(txt|md|csv|json|sql)$/i.test(file.name) || file.name.length > 120) throw Error('Use a short filename ending in .txt, .md, .csv, .json, or .sql.')
          const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
          if (!content.trim() || content.length > 12000 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) throw Error('Use readable UTF-8 text, up to 12,000 characters per file.')
          additions.push({ name: file.name, content })
        }
        const next = [...files, ...additions]
        if (new Set(next.map(f => f.name.toLowerCase())).size !== next.length) throw Error('Each file must have a unique name. Remove the old version before adding a replacement.')
        if (next.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0) > 24000) throw Error('Files must total 24 KB or less.')
        onChange(next)
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not read these files.') }
      finally { setReading(false); onReading?.(false); if (input.current) input.current.value = '' }
    }} /></label>
    <small>Up to 3 UTF-8 files · 24 KB total · TXT, Markdown, CSV, JSON, SQL</small>
    {reading && <p role="status">Reading files…</p>}
    {error && <p className="reference-error" role="alert">{error}</p>}
    {files.map((file, index) => <div className="reference-file" key={file.name}><details><summary>{file.name}</summary><pre>{file.content}</pre></details><button type="button" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X size={16} /></button></div>)}
    <p className="reference-disclosure">{previewOnly ? "Demo only: files stay in this page’s memory. In a real connection, references are stored and shared with the AI provider during queries. Use synthetic examples here." : <>Added files are stored encrypted with this connection and sent to the AI provider when needed for queries. Include descriptions and synthetic examples only—not passwords, API keys, or private records. These examples are templates, not definitions for your actual database. Changes apply to future queries; removing a file does not erase earlier conversation context.</>}</p>
  </section>
}

export function ReferenceManager({ connectionId, name, onClose }: { connectionId: string; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [files, setFiles] = useState<ReferenceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
    let active = true
    connectionsApi.getReferences(connectionId).then(data => { if (active) { setFiles(data.files); setReady(true) } }).catch(err => { if (active) setError(authError(err, 'Could not load reference files.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [connectionId])
  return <dialog ref={dialog} className="connection-dialog reference-dialog" aria-labelledby="reference-manager-title" onCancel={e => { e.preventDefault(); if (!saving) onClose() }}>
    <header><div><span>DATABASE CONTEXT</span><h2 id="reference-manager-title">{name}</h2></div><button type="button" disabled={saving} onClick={onClose} aria-label="Close reference files"><X size={20} /></button></header>
    <div className="connection-form">{loading ? <p role="status">Loading references…</p> : ready && <ReferenceFiles files={files} onChange={setFiles} disabled={saving} onReading={setReading} />}
      {error && <p className="connection-error" role="alert">{error}</p>}
      <footer><div><button className="connection-secondary" disabled={saving} onClick={onClose}>Cancel</button><button className="connection-primary" disabled={!ready || saving || reading} onClick={async () => { setSaving(true); setError(''); try { await connectionsApi.saveReferences(connectionId, files); onClose() } catch (err) { setError(authError(err, 'Could not save references.')) } finally { setSaving(false) } }}>{saving ? 'Saving…' : files.length ? 'Save reference files' : 'Save without references'}</button></div></footer>
    </div>
  </dialog>
}
