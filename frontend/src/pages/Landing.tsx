/**
 * pages/Landing.tsx
 * Production landing page — dense, visually rich, fully responsive.
 */
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const FEATURES = [
  {
    title: 'Schema-aware table pruning',
    description:
      'Before generating SQL the agent embeds your question and selects only the relevant tables — so the model reasons over a focused, accurate context instead of your entire schema.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
  },
  {
    title: 'AST validation + read-only execution',
    description:
      'Every generated query is parsed with sqlglot before it runs. Queries execute inside a read-only transaction — no INSERT, UPDATE, or DROP can ever reach your data.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    title: 'Human-in-the-loop approval',
    description:
      'Complex or ambiguous queries pause before execution and show you the SQL. Review, edit, or reject — then the agent continues. Nothing runs without your sign-off.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
    color: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
  },
  {
    title: 'Self-correcting retry loop',
    description:
      'If a query fails validation or execution, the agent catches the error, revises the SQL, and retries — up to 3 times — before surfacing a failure to the user.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15"/>
      </svg>
    ),
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  {
    title: 'Instant tables and charts',
    description:
      'Results render as sortable, paginated data tables. Ask for a chart and the agent generates a matplotlib/plotly visualization returned as a base64 image inline.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/>
        <rect x="2" y="13" width="4" height="8"/>
      </svg>
    ),
    color: 'text-pink-400',
    bg: 'bg-pink-500/10',
    border: 'border-pink-500/20',
  },
  {
    title: 'Bring your own database',
    description:
      'Connect any PostgreSQL database with an encrypted connection string. The agent adapts to your schema automatically — works the same way as the demo.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    color: 'text-accent-400',
    bg: 'bg-accent-500/10',
    border: 'border-accent-500/20',
  },
]

const STEPS = [
  { step: '01', title: 'Type a question', desc: 'Ask anything in plain English — "top 10 customers by revenue" or "plot monthly sales trend".' },
  { step: '02', title: 'Agent reasons over your schema', desc: 'The 9-node LangGraph pipeline selects tables, generates SQL, validates it, and checks safety.' },
  { step: '03', title: 'Review and approve', desc: 'Complex queries pause for your approval. You see the SQL before anything executes.' },
  { step: '04', title: 'Get results instantly', desc: 'Results appear as a table or chart, streamed live as the agent works.' },
]

const STACK = [
  { name: 'LangGraph', desc: '9-node state machine' },
  { name: 'Groq',      desc: 'LLM inference' },
  { name: 'PostgreSQL',desc: 'Data storage' },
  { name: 'sqlglot',   desc: 'AST validation' },
  { name: 'FastAPI',   desc: 'REST backend' },
  { name: 'React',     desc: 'Frontend' },
]

export default function Landing() {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const heroRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) navigate('/chat', { replace: true })
  }, [user, navigate])

  // Subtle parallax on mouse move (desktop only)
  useEffect(() => {
    const hero = heroRef.current
    if (!hero || window.innerWidth < 768) return
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth  - 0.5) * 20
      const y = (e.clientY / window.innerHeight - 0.5) * 14
      hero.style.setProperty('--mx', `${x}px`)
      hero.style.setProperty('--my', `${y}px`)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div className="min-h-dvh bg-surface-950 text-slate-100 font-sans overflow-x-hidden">

      {/* ── Static ambient background (always visible) ──────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        {/* Top-left orb */}
        <div style={{
          position: 'absolute', top: '-160px', left: '-160px',
          width: '700px', height: '700px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        {/* Top-right orb */}
        <div style={{
          position: 'absolute', top: '-80px', right: '-80px',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        {/* Bottom orb */}
        <div style={{
          position: 'absolute', bottom: '-100px', left: '50%', transform: 'translateX(-50%)',
          width: '600px', height: '400px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 16px rgba(99,102,241,0.4)' }}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-bold text-white text-sm sm:text-base tracking-tight">SQL Cockpit</span>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/login" className="text-sm text-slate-400 hover:text-white transition-colors font-medium px-3 py-2 hidden xs:block">
            Sign in
          </Link>
          <Link to="/signup"
            className="text-sm font-semibold text-white px-4 py-2 rounded-xl transition-all duration-200 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 12px rgba(99,102,241,0.3)' }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-12 sm:pt-20 pb-10 sm:pb-16 text-center"
      >
        {/* Tech badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 mb-8 rounded-full text-xs font-medium"
             style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.30)', color: '#a5b4fc' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent-400" style={{ animation: 'glowPulse 2s ease-in-out infinite' }} />
          LangGraph · Groq · PostgreSQL · sqlglot
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
          <span className="text-white">Ask your database</span>
          <br />
          <span style={{
            background: 'linear-gradient(90deg, #a5b4fc 0%, #818cf8 40%, #c084fc 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            in plain English
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Type a question. The agent selects the right tables, writes validated SQL,
          and returns a table or chart — with a human approval checkpoint before anything runs.
        </p>

        {/* CTAs */}
        <div className="flex flex-col xs:flex-row items-center justify-center gap-3 mb-5">
          <Link to="/signup" id="hero-cta"
            className="w-full xs:w-auto text-white font-bold text-base px-8 py-3.5 rounded-2xl
                       transition-all duration-200 active:scale-95 inline-flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 32px rgba(99,102,241,0.35)' }}>
            Start for free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link to="/login"
            className="w-full xs:w-auto text-slate-300 hover:text-white font-medium text-sm px-6 py-3.5 rounded-2xl
                       border border-white/10 hover:border-white/20 transition-all duration-200 text-center">
            Sign in →
          </Link>
        </div>
        <p className="text-sm text-slate-600">Free demo database included · No credit card</p>
      </section>

      {/* ── Console preview ────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="rounded-2xl overflow-hidden border border-white/10"
             style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)' }}>
          {/* Browser chrome */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.07]"
               style={{ background: 'rgba(30,32,40,0.95)' }}>
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 rounded-md text-[11px] text-slate-500 font-mono"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                sql-cockpit.app/chat
              </div>
            </div>
          </div>

          {/* Two-panel layout */}
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]" style={{ background: '#0d0f14' }}>
            {/* Sidebar mock */}
            <div className="hidden md:block border-r border-white/[0.06] p-4"
                 style={{ background: 'rgba(19,21,28,0.8)' }}>
              <div className="flex items-center gap-2 mb-5">
                <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                     style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                    <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="text-xs font-semibold text-white">SQL Cockpit</span>
              </div>
              <div className="space-y-1.5">
                {['Top artists by sales', 'Monthly revenue', 'Customer segments'].map((t, i) => (
                  <div key={t} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs"
                       style={{ background: i === 0 ? 'rgba(99,102,241,0.15)' : 'transparent',
                                color: i === 0 ? '#a5b4fc' : '#64748b',
                                borderLeft: i === 0 ? '2px solid #818cf8' : '2px solid transparent' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Main chat area */}
            <div className="p-5 sm:p-7 min-h-[280px] sm:min-h-[360px]">
              {/* User message */}
              <div className="flex justify-end mb-5">
                <div className="max-w-xs text-sm px-4 py-3 rounded-2xl rounded-tr-sm"
                     style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.25)', color: '#e2e8f0' }}>
                  Show top 10 customers by total revenue
                </div>
              </div>

              {/* Agent steps */}
              <div className="mb-4">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" style={{ boxShadow: '0 0 6px rgba(139,92,246,0.8)' }} />
                  Selecting tables: <span className="text-violet-400 font-mono ml-1">invoices, customers</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                  <span className="text-emerald-400">AST validated</span> · Read-only transaction
                </div>
              </div>

              {/* SQL block */}
              <div className="rounded-xl p-4 mb-4 text-[11px] font-mono text-emerald-400 overflow-x-auto"
                   style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-slate-500 text-[10px] uppercase tracking-wider mb-2 font-sans">Generated SQL</div>
                {`SELECT c.FirstName || ' ' || c.LastName AS customer,\n       SUM(i.Total) AS revenue\nFROM   invoices i\nJOIN   customers c ON c.CustomerId = i.CustomerId\nGROUP  BY c.CustomerId\nORDER  BY revenue DESC\nLIMIT  10`}
              </div>

              {/* Result table preview */}
              <div className="rounded-xl overflow-hidden text-[11px]"
                   style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="grid grid-cols-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
                     style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span>Customer</span><span>Revenue</span>
                </div>
                {[['Helena Holy', '$49.62'], ['Richard Cunningham', '$47.62'], ['Luis Rojas', '$46.62']].map(([name, rev]) => (
                  <div key={name} className="grid grid-cols-2 px-3 py-1.5 border-t border-white/[0.04] text-slate-300 font-mono">
                    <span className="truncate">{name}</span><span className="text-emerald-400">{rev}</span>
                  </div>
                ))}
                <div className="px-3 py-1.5 border-t border-white/[0.04] text-[10px] text-slate-600">
                  +7 more rows
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Everything your team needs
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-lg mx-auto">
            A complete agentic pipeline from question to result — with safety, transparency, and control built in.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border transition-all duration-300 cursor-default hover:-translate-y-1"
              style={{
                background: 'rgba(19,21,28,0.8)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.14)' }}
              onMouseLeave={(e) => { e.currentTarget.style.border = '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4
                              ${f.bg} ${f.border} border ${f.color}
                              transition-transform duration-300 group-hover:scale-110`}>
                {f.icon}
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm leading-snug">{f.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-16 sm:pb-24">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">How it works</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto">Four steps from your question to a verified result.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s, i) => (
            <div key={s.step} className="relative">
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-6 left-[calc(100%-1rem)] w-8 h-px bg-white/[0.08] z-10" />
              )}
              <div className="p-5 rounded-2xl h-full"
                   style={{ background: 'rgba(19,21,28,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="text-3xl font-black mb-3"
                     style={{ background: 'linear-gradient(135deg, #6366f1, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {s.step}
                </div>
                <h3 className="font-semibold text-white text-sm mb-2">{s.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stack strip ───────────────────────────────────────────────────── */}
      <section className="relative z-10 border-y border-white/[0.06] py-10"
               style={{ background: 'rgba(19,21,28,0.5)' }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <p className="text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 font-semibold mb-6">
            Built on open-source infrastructure
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {STACK.map((s) => (
              <div key={s.name}
                   className="flex items-center gap-2 px-4 py-2 rounded-full text-sm
                              text-slate-400 hover:text-slate-200 transition-all duration-150"
                   style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="font-medium">{s.name}</span>
                <span className="text-slate-600 text-xs hidden sm:inline">— {s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Ready to query your data?
          </h2>
          <p className="text-slate-400 text-sm sm:text-base mb-8 leading-relaxed">
            Create a free account and start exploring your database in plain English in under a minute.
          </p>
          <Link to="/signup"
            className="inline-flex items-center gap-2 text-white font-bold text-base px-10 py-4 rounded-2xl
                       transition-all duration-200 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.30)' }}>
            Get started free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <p className="mt-4 text-xs text-slate-600">No credit card · Free demo database included</p>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-sm text-slate-500 font-medium">SQL Cockpit</span>
          </div>
          <p className="text-xs text-slate-700">LangGraph · Groq · PostgreSQL · sqlglot · FastAPI · React</p>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <Link to="/login"  className="hover:text-slate-400 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-slate-400 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
