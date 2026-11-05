import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Database, Check, ArrowUpRight } from 'lucide-react'
import '../auth.css'
import BrandMark from './BrandMark'

export default function AuthLayout({ children, signup = false }: { children: ReactNode; signup?: boolean }) {
  return <main className="account-page">
    <header className="account-header"><Link to="/" className="account-brand"><BrandMark size={32} />SQL Cockpit</Link><Link to="/" className="account-back"><ArrowLeft size={15} />Back to home</Link></header>
    <div className="account-layout">
      <section className="account-story">
        <span className="account-eyebrow">YOUR POSTGRESQL ANALYSIS WORKSPACE</span>
        <h1>{signup ? <>Good questions.<br /><em>Useful answers.</em></> : <>Your data.<br /><em>Ready to explore.</em></>}</h1>
        <p>From a question to an answer you can check.<br />Keep the useful work, and build on it tomorrow.</p>
        <div className="account-example" aria-label="Example analysis workflow">
          <div className="account-example-top"><span><Database size={15} />Chinook sample</span><span>EXAMPLE</span></div>
          <p>Which countries bring in the most revenue?</p>
          <div className="account-bars">{[['USA', '100%', '$523.06'], ['Canada', '58%', '$303.96'], ['France', '37%', '$195.10']].map(([name, width, value]) => <div key={name}><span>{name}</span><div><i style={{ width }} /></div><span>{value}</span></div>)}</div>
          <footer><Check size={14} />Inspect the SQL. Save the analysis.</footer>
        </div>
        <Link to={signup ? "/login?demo=1" : "/#product"} className="account-sample">{signup ? "Just looking? Explore the Chinook sample" : "Take a look inside the workspace"} <ArrowUpRight size={15} /></Link>
      </section>
      <section className="account-form-panel">{children}</section>
    </div>
    <footer className="account-footer"><span>SQL Cockpit · Ask. Inspect. Keep.</span><a href="/privacy.html">Privacy policy</a></footer>
  </main>
}
