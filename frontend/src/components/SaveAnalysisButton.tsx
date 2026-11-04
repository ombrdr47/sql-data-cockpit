import { useState } from 'react'
import { Bookmark, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { analysesApi } from '../lib/api'

export default function SaveAnalysisButton({ messageId, question, disabled }: {
  messageId: string; question: string; disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(question.slice(0, 120))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  if (saved) return <span className="explore-saved-confirmation" role="status"><Check size={14} />Saved to your library</span>
  return <div className="explore-save">
    {!open ? <button className="explore-action" disabled={disabled} onClick={() => setOpen(true)}><Bookmark size={14} />Save analysis</button> : (
      <form onSubmit={async e => {
        e.preventDefault()
        if (saving || disabled || !name.trim()) return
        setSaving(true); setError('')
        try {
          await analysesApi.save(messageId, name.trim())
          await queryClient.invalidateQueries({ queryKey: ['saved-analyses'] })
          setSaved(true)
        } catch { setError('Could not save this analysis. Please try again.') }
        finally { setSaving(false) }
      }}>
        <label>Analysis name<input autoFocus maxLength={120} required value={name} onChange={e => setName(e.target.value)} /></label>
        <p>Saves the approved SQL, data source, and current result.</p>
        <div><button className="explore-action" type="submit" disabled={saving || disabled || !name.trim()}>{saving ? 'Saving…' : 'Save analysis'}</button><button type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button></div>
        {error && <p role="alert">{error}</p>}
      </form>
    )}
  </div>
}
