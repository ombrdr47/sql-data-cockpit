import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Bookmark, Check, ChevronDown, Code2, Database, LayoutGrid, MessageSquare, Plus, RotateCcw, ShieldCheck, Table2 } from 'lucide-react'
import '../landing.css'
import BrandMark from '../components/BrandMark'

const revenue = [
  { country: 'USA', value: 523.06 },
  { country: 'Canada', value: 303.96 },
  { country: 'France', value: 195.10 },
]
const exampleSql = `SELECT i.billing_country AS country,
       SUM(i.total) AS total_revenue
FROM invoice i
GROUP BY i.billing_country
ORDER BY total_revenue DESC
LIMIT 3;`

export default function Landing() {
  return (
    <div className="home-page">
      <a className="home-skip" href="#home-main">Skip to content</a>
      <header className="home-nav home-container">
        <Link className="home-brand" to="/" aria-label="SQL Cockpit home"><BrandMark size={32} />SQL Cockpit<span className="home-beta">BETA</span></Link>
        <nav aria-label="Main navigation"><a href="#product">Product</a><a href="#workflow">How it works</a><a href="#questions">Questions</a></nav>
        <div className="home-nav-actions"><Link to="/login">Sign in</Link><Link className="home-button home-button-small" to="/signup">Get started <ArrowUpRight size={15} /></Link></div>
      </header>

      <main id="home-main">
        <section className="home-hero home-container">
          <div className="home-kicker"><span /> A WORKSPACE FOR YOUR POSTGRES DATA</div>
          <div className="home-hero-grid">
            <h1>Your data.<br /><em>A clearer picture.</em></h1>
            <div className="home-hero-copy"><p>Ask a question. See the evidence.<br />Keep the analysis worth coming back to.</p><p className="home-description">SQL Cockpit brings questions, query results, and reusable analyses into one focused workspace.</p>
              <Link to="/login?demo=1" className="home-button">Try the sample workspace <ArrowRight size={17} /></Link>
              <span className="home-hero-note">Explore Chinook without signing up.</span>
            </div>
          </div>
          <div className="home-preview-intro"><span><span className="home-small-dot" /> One question. An answer you can inspect.</span><a href="#product">Take a look <ArrowDown size={14} /></a></div>
          <ProductPreview />
          <div className="home-preview-caption"><span>Interactive preview · Chinook sample data</span><span><Database size={13} /> PostgreSQL <span className="home-caption-separator">/</span> <ShieldCheck size={13} /> Review before execution</span></div>
        </section>

        <section className="home-workflow home-container" id="workflow">
          <div className="home-section-heading"><span className="home-kicker">A SMALLER DISTANCE TO YOUR ANSWER</span><h2>From “I wonder”<br />to “here it is.”</h2><p>A useful analysis should be easy to start,<br className="home-desktop-break" /> easy to check, and easy to return to.</p></div>
          <div className="home-steps">
            <article><span className="home-step-number">01 / EXPLORE</span><MessageSquare size={22} /><h3>Start with a question.</h3><p>Ask in plain English and refine the answer with follow-ups. Your conversation keeps the context.</p></article>
            <article><span className="home-step-number">02 / VERIFY</span><Code2 size={22} /><h3>Look behind the answer.</h3><p>Review the SQL before it runs. Inspect the returned rows, view charts, and export results.</p></article>
            <article><span className="home-step-number">03 / REUSE</span><Bookmark size={22} /><h3>Keep the useful work.</h3><p>Save an analysis with its SQL and data source. Rerun the same query when you need a fresh result.</p></article>
          </div>
        </section>

        <section className="home-reuse">
          <div className="home-container home-reuse-grid">
            <div><span className="home-kicker">LESS STARTING OVER</span><h2>Your next question<br />has a head start.</h2><p>Good work shouldn’t disappear into a chat history. Give an analysis a name, keep its last successful result, and pick it up again.</p><Link to="/signup" className="home-text-link">Create your workspace <ArrowUpRight size={17} /></Link></div>
            <div className="home-saved-example" aria-label="Illustration of a saved analysis">
              <div className="home-saved-top"><Bookmark size={16} /><span>Your saved analyses</span><span className="home-example-label">EXAMPLE</span></div>
              <div className="home-saved-record"><span className="home-saved-icon"><BarChart3 size={24} /></span><div><h3>Revenue by country</h3><p>Chinook sample · 3 returned rows</p></div><Check size={16} /></div>
              <div className="home-saved-properties"><span>Question<span>Which countries bring in the most revenue?</span></span><span>Query<span>Saved SQL, preserved on every rerun</span></span><span>Result<span>Last successful snapshot</span></span></div>
              <div className="home-saved-bottom"><span><ShieldCheck size={14} /> Approval required on rerun</span><Link to="/login?demo=1">Try the sample workspace <ArrowRight size={14} /></Link></div>
            </div>
          </div>
        </section>

        <section className="home-faq home-container" id="questions">
          <div><span className="home-kicker">BEFORE YOU CONNECT</span><h2>A few useful details.</h2><p>Start with sample data.<br />Bring your own database when you’re ready.</p></div>
          <div className="home-faq-list">
            {[
              ['Can I try it without connecting my database?', 'Yes. Each sample workspace uses the Chinook sample database. The sample workspace lets you ask questions, inspect results, and try saved analyses. Use a personal account for your own data.'],
              ['What do I need for my own workspace?', 'A personal account, a Groq API key, and an accessible PostgreSQL database. Connection setup asks for your database details. Use a dedicated read-only database user.'],
              ['Does the app change my database?', 'The query flow validates SELECT queries and requires your approval before execution. Use read-only database credentials as an additional safeguard. SQL validation does not guarantee that a business calculation is correct.'],
              ['What data is sent to the AI provider?', 'Schema information, relevant conversation context, and query results may be sent to Groq to generate queries and explain answers. Returned results are also stored by the app so you can revisit analyses. Only connect data you are authorized to process this way.'],
              ['What happens when I rerun a saved analysis?', 'The app validates the stored SQL and asks for approval again. Successful runs refresh the saved result. Failed or rejected runs leave the last successful result intact; the saved SQL is not automatically rewritten.'],
            ].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}
          </div>
        </section>

        <section className="home-final home-container"><div><span className="home-kicker">MAKE SOMETHING OF YOUR DATA</span><h2>Your next useful answer<br />starts with a question.</h2></div><Link className="home-button home-button-light" to="/login?demo=1">Explore the sample workspace <ArrowUpRight size={18} /></Link></section>
      </main>
      <footer className="home-footer home-container"><Link className="home-brand" to="/"><BrandMark size={26} />SQL Cockpit</Link><span>Ask. Inspect. Keep.</span><div><a href="https://github.com/ombrdr47/sql-data-cockpit" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a><a href="/privacy.html">Privacy</a><Link to="/login">Sign in</Link></div></footer>
    </div>
  )
}

export function ProductPreview({ mark = '/favicon.svg' }: { mark?: string }) {
  const [view, setView] = useState<'results' | 'chart' | 'sql' | 'saved'>('results')
  const [saved, setSaved] = useState(false)
  return <div className="home-product" id="product">
    <aside className="home-product-sidebar"><span className="home-product-logo"><img src={mark} width={24} height={24} alt="" />Cockpit</span><span className="home-preview-label">PREVIEW</span><button aria-pressed={view !== 'saved'} onClick={() => setView('results')}><LayoutGrid size={15} />Explore</button><button aria-pressed={view === 'saved'} onClick={() => setView('saved')}><Bookmark size={15} />Saved analyses{saved && <span className="home-saved-count">1</span>}</button><div className="home-preview-source"><span className="home-small-dot" />Chinook sample</div></aside>
    <div className="home-product-main">
      <div className="home-product-toolbar"><span>Explore <span>/</span> Revenue by country</span><span className="home-preview-label">SAMPLE WORKSPACE</span></div>
      <div className="home-product-columns">
        <div className="home-preview-chat"><span className="home-preview-label">CONVERSATION</span><div className="home-preview-question">Which countries bring in the most invoice revenue? Show the top 3.</div><span className="home-preview-assistant"><Database size={14} />SQL Cockpit</span><p>The USA leads with <strong>$523.06</strong>, followed by Canada and France.</p><span className="home-preview-complete"><Check size={13} /> Sample query completed</span><button className="home-preview-inspect" onClick={() => setView('sql')}>Inspect the SQL <ArrowUpRight size={13} /></button><Link className="home-preview-input" to="/login?demo=1"><Plus size={15} />Ask your own question<ArrowRight size={15} /></Link></div>
        <div className="home-preview-results">
          <div className="home-preview-result-heading"><div><span className="home-preview-label">{view === 'saved' ? 'YOUR LIBRARY' : 'ANALYSIS'}</span><h3>{view === 'saved' ? 'Saved analyses' : 'Revenue by country'}</h3></div><button className="home-preview-save" aria-pressed={saved} onClick={() => setSaved(v => !v)}>{saved ? <Check size={13} /> : <Bookmark size={13} />}{saved ? 'Saved' : 'Save'}</button></div>
          <div className="home-preview-tabs" aria-label="Preview result view">{(['results', 'chart', 'sql'] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{tab === 'results' ? <Table2 size={13} /> : tab === 'chart' ? <BarChart3 size={13} /> : <Code2 size={13} />}{tab === 'sql' ? 'SQL' : tab[0].toUpperCase() + tab.slice(1)}</button>)}</div>
          <div key={view} className="home-preview-content" aria-live="polite">
            {view === 'results' && <><div className="home-preview-table-label"><span>3 returned rows</span><span>Invoice revenue · USD</span></div><table><thead><tr><th>Country</th><th>Total revenue</th></tr></thead><tbody>{revenue.map((row, index) => <tr key={row.country}><td><span className="home-row-index">0{index + 1}</span>{row.country}</td><td>${row.value.toFixed(2)}</td></tr>)}</tbody></table><p className="home-preview-footnote">A result you can read. A query you can check.</p></>}
            {view === 'chart' && <div className="home-preview-chart" role="img" aria-label="Total invoice revenue: USA 523.06 dollars, Canada 303.96 dollars, France 195.10 dollars"><span className="home-preview-label">TOTAL INVOICE REVENUE · USD</span>{revenue.map(row => <div className="home-chart-row" key={row.country}><span>{row.country}</span><div><span style={{width: `${row.value / 523.06 * 100}%`}} /></div><strong>${row.value.toFixed(2)}</strong></div>)}</div>}
            {view === 'sql' && <pre><code>{exampleSql}</code></pre>}
            {view === 'saved' && <div className="home-preview-library"><Bookmark size={25} /><h4>{saved ? 'Revenue by country' : 'Keep this analysis for next time.'}</h4><p>{saved ? 'The question, SQL, and result are together in one place.' : 'Select Save above to try the library preview.'}</p>{saved && <Link to="/login?demo=1"><RotateCcw size={14} />Try a real rerun in the app</Link>}</div>}
          </div>
        </div>
      </div>
    </div>
  </div>
}
