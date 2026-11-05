import { useMemo, useState } from 'react'
import { ArrowUpRight, BarChart3, Check, Code2, Copy, Database, Loader2, RotateCcw, Table2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DataTable from './DataTable'
import ChartView from './ChartView'
import type { Message } from './MessageBubble'
import SaveAnalysisButton from './SaveAnalysisButton'
import { chartFromResults, chartRequested } from '../lib/resultChart'

export interface AnalysisResult {
  message: Message
  question: string
}

interface Props {
  results: AnalysisResult[]
  selectedId: string | null
  source: string
  busy: boolean
  onSelect: (id: string) => void
  onAsk: (question: string) => void
  onConversation: () => void
}

export default function ExploreResults({ results, selectedId, source, busy, onSelect, onAsk, onConversation }: Props) {
  const result = results.find(r => r.message.id === selectedId) ?? results.at(-1)
  return (
    <section className="explore-results" aria-label="Analysis results">
      <div className="explore-results-heading">
        <div><span className="explore-eyebrow">ANALYSIS</span><h2>Your results</h2></div>
        <span className="explore-source"><Database size={13} />{source}</span>
      </div>
      {results.length > 0 && (
        <label className="explore-result-picker">Question
          <select value={result?.message.id ?? ''} onChange={e => onSelect(e.target.value)}>
            {results.map((r, i) => <option key={r.message.id} value={r.message.id}>{i + 1}. {r.question}</option>)}
          </select>
        </label>
      )}
      {result ? (
        <ResultDetail key={result.message.id} result={result} busy={busy} onAsk={onAsk} onConversation={onConversation} />
      ) : (
        <div className="explore-results-empty">
          <div className="explore-empty-mark"><Table2 size={28} strokeWidth={1.3} /></div>
          <span className="explore-eyebrow">FROM QUESTION TO EVIDENCE</span>
          <h3>A clearer view of your data.</h3>
          <p>Ask a question on the left. Explore the answer here, inspect its SQL, and export the rows you need.</p>
          <div className="explore-empty-capabilities"><span><Table2 size={15} /> Results</span><span><BarChart3 size={15} /> Charts</span><span><Code2 size={15} /> SQL</span></div>
          <div className="explore-empty-note"><Database size={16} /><span>Data source: <strong>{source}</strong><br />Queries wait for your approval before running.</span></div>
        </div>
      )}
    </section>
  )
}

function ResultDetail({ result: { message, question }, busy, onAsk, onConversation }: {
  result: AnalysisResult
  busy: boolean
  onAsk: (question: string) => void
  onConversation: () => void
}) {
  const [selectedView, setView] = useState<'results' | 'chart' | 'sql' | null>(null)
  const [copyState, setCopyState] = useState('Copy SQL')
  const sql = message.approvalRequest?.sql || message.generatedSql
  const pending = message.approvalRequest?.status === 'pending'
  const failed = Boolean(message.error)
  const chart = useMemo(
    () => message.tableData ? chartFromResults(message.tableData) : null,
    [message.tableData],
  )
  const chartData = message.chartBase64 || chart?.json
  const chartReady = !failed && !pending && !message.isStreaming && Boolean(chartData)
  const view = selectedView ?? (chartReady && chartRequested(question) ? 'chart' : 'results')
  const status = failed ? 'Could not complete' : pending ? 'Awaiting approval' : message.isStreaming ? 'Working' : 'Answer ready'

  async function copySql() {
    if (!sql) return
    try { await navigator.clipboard.writeText(sql); setCopyState('Copied') }
    catch { setCopyState('Select the SQL to copy') }
  }

  return (
    <>
      <div className="explore-result-meta" aria-live="polite">
        <span className={`explore-status ${failed ? 'is-error' : pending ? 'is-pending' : ''}`}>
          {message.isStreaming ? <Loader2 size={13} className="animate-spin" /> : <span className="explore-status-dot" />}{status}
        </span>
        {message.tableData && <span>{message.tableData.rows.length} returned rows · {message.tableData.columns.length} columns</span>}
        {message.ranAt && <span>Run {new Date(message.ranAt).toLocaleString()}</span>}
      </div>
      {message.persistedId && message.querySucceeded && !message.isStreaming && !failed && !pending && (
        <SaveAnalysisButton messageId={message.persistedId} question={question} disabled={busy} />
      )}
      <nav className="explore-view-switch" aria-label="Result view">
        <button aria-pressed={view === 'results'} onClick={() => setView('results')}><Table2 size={15} />Results</button>
        <button aria-pressed={view === 'chart'} onClick={() => setView('chart')}><BarChart3 size={15} />Chart</button>
        <button aria-pressed={view === 'sql'} onClick={() => setView('sql')}><Code2 size={15} />SQL</button>
      </nav>
      <div className="explore-result-body">
        {pending && <div className="explore-notice">Review the query in the conversation to run this analysis.<button onClick={onConversation}>Review query <ArrowUpRight size={14} /></button></div>}
        {view === 'results' && <>
          {message.content && <div className="explore-answer prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>}
          {message.tableData ? <>
            <DataTable columns={message.tableData.columns} rows={message.tableData.rows} totalRows={message.tableData.totalRows} />
            <p className="explore-result-footnote">Export includes the returned rows, which may be limited by the query or server row cap.</p>
          </> : !message.isStreaming && !pending && !failed && sql ? (
            <div className="explore-notice">Result rows are not stored with older conversations. Rerun the question to load a fresh table.
              <button disabled={busy} onClick={() => onAsk(question)}><RotateCcw size={14} />Rerun question</button>
            </div>
          ) : !message.content && !pending ? <div className="explore-waiting">{message.isStreaming ? 'Preparing your answer…' : 'No result data is available for this answer.'}</div> : null}
        </>}
        {view === 'chart' && (chartReady && chartData ? <>
          <ChartView base64={chartData} />
          {!message.chartBase64 && chart && message.tableData && chart.plottedRows < message.tableData.rows.length && (
            <p className="explore-result-footnote">Showing {chart.plottedRows} of {message.tableData.rows.length} returned rows. Open Results for the full table.</p>
          )}
        </> : <div className="explore-view-empty">
          <BarChart3 size={28} />
          <h3>{pending || message.isStreaming ? 'Waiting for query results' : 'No chart for this result'}</h3>
          <p>{pending || message.isStreaming
            ? 'A chart can be drawn after the query returns its rows.'
            : 'Charts need at least two rows with a numeric value and distinct labels or dates. Open Results to inspect the returned data.'}</p>
        </div>)}
        {view === 'sql' && (sql ? <div className="explore-sql"><div><span>PostgreSQL · {pending ? 'Awaiting approval' : 'Generated query'}</span><button onClick={copySql}>{copyState === 'Copied' ? <Check size={14} /> : <Copy size={14} />}{copyState}</button></div><pre tabIndex={0}><code>{sql}</code></pre></div> : <div className="explore-waiting">The generated query will appear here.</div>)}
      </div>
    </>
  )
}
