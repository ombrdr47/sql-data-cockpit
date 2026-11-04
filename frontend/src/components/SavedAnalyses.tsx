import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bookmark, Play, X } from 'lucide-react'
import { analysesApi, type SavedAnalysis } from '../lib/api'
import ExploreResults from './ExploreResults'
import { useAuth } from '../lib/auth'

export default function SavedAnalyses({ onClose, onRun, busy }: {
  onClose: () => void; onRun: (analysis: SavedAnalysis) => void; busy: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { user } = useAuth()
  const { data: analyses = [], isPending, isError, refetch } = useQuery({ queryKey: ['saved-analyses', user?.user_id], queryFn: analysesApi.list })
  const selected = analyses.find(a => a.id === selectedId) ?? analyses[0]
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return <dialog ref={dialog} className="saved-library" onCancel={onClose} aria-labelledby="saved-library-title">
    <header><div><span className="explore-eyebrow">YOUR WORKSPACE</span><h2 id="saved-library-title"><Bookmark size={20} />Saved analyses</h2></div><button onClick={onClose} aria-label="Close saved analyses"><X size={20} /></button></header>
    {isPending ? <p className="saved-library-empty" role="status">Loading your analyses…</p> : isError ? (
      <div className="saved-library-empty" role="alert"><p>Could not load your saved analyses.</p><button className="explore-action" onClick={() => refetch()}>Try again</button></div>
    ) : !selected ? <div className="saved-library-empty"><Bookmark size={34} /><h3>Your useful answers, ready to revisit.</h3><p>Run and approve a query, then choose “Save analysis” in the results panel. Its SQL and result will be here next time.</p><button className="explore-action" onClick={onClose}>Back to Explore</button></div> : (
      <div className="saved-library-layout">
        <nav aria-label="Saved analyses">{analyses.map(analysis => <button key={analysis.id} aria-current={analysis.id === selected.id ? 'true' : undefined} onClick={() => setSelectedId(analysis.id)}><strong>{analysis.name}</strong><span>{analysis.source_name}</span><small>Last successful run {new Date(analysis.last_run_at).toLocaleDateString()}</small></button>)}</nav>
        <div className="saved-library-detail">
          <div className="saved-library-run"><div><strong>{selected.name}</strong><p>Stored result · rerun to refresh using the same SQL.</p>{!selected.is_demo && !selected.connection_id && <p role="alert">This data source has been removed. The stored result remains available.</p>}</div><button className="explore-action" disabled={busy || (!selected.is_demo && !selected.connection_id)} onClick={() => onRun(selected)}><Play size={14} />Rerun SQL</button></div>
          <ExploreResults key={selected.id} source={selected.source_name} selectedId={selected.id} busy={true} onSelect={() => {}} onAsk={() => {}} onConversation={onClose} results={[{
            question: selected.question,
            message: {
              id: selected.id, role: 'assistant', content: selected.snapshot.answer ?? '',
              generatedSql: selected.sql, chartBase64: selected.snapshot.chart,
              ranAt: selected.snapshot.ran_at,
              tableData: selected.snapshot.rows ? { rows: selected.snapshot.rows, columns: selected.snapshot.columns, totalRows: selected.snapshot.rows.length } : null,
            },
          }]} />
        </div>
      </div>
    )}
  </dialog>
}
