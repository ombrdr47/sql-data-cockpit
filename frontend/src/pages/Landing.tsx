/**
 * pages/Landing.tsx
 * Premium dark marketing page.
 * - Animated gradient mesh hero
 * - Real stack attribution only
 * - Mobile-first layout
 * - Zero fake metrics
 */
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const FEATURES = [
  {
    title: 'Schema pruning',
    description:
      'Before generating SQL, the agent selects only the tables relevant to your question — so the model reasons over focused, accurate context instead of your entire schema.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    color: 'text-violet-400',
    glow: 'rgba(139,92,246,0.25)',
  },
  {
    title: 'AST safety validation',
    description:
      'Every generated query is parsed and validated before it runs. Queries execute in a read-only transaction — no data can ever be modified.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    color: 'text-emerald-400',
    glow: 'rgba(52,211,153,0.20)',
  },
  {
    title: 'Human approval',
    description:
      'Complex or ambiguous queries pause and show you the generated SQL before execution. Review, edit, or reject — then the agent continues.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
    color: 'text-sky-400',
    glow: 'rgba(56,189,248,0.20)',
  },
]

const DEMO_LINES = [
  { prefix: '>', text: 'Show top 10 customers by revenue', color: 'text-slate-300' },
  { prefix: '⊙', text: 'Selecting tables: invoices, customers', color: 'text-violet-400' },
  { prefix: '✦', text: 'SELECT c.FirstName, SUM(i.Total) AS Revenue\n  FROM invoices i JOIN customers c ON c.CustomerId = i.CustomerId\n  GROUP BY c.CustomerId ORDER BY Revenue DESC LIMIT 10', color: 'text-emerald-400', isCode: true },
  { prefix: '◈', text: 'AST validated · Read-only · 10 rows returned', color: 'text-sky-400' },
]

const STACK = ['LangGraph', 'Groq', 'PostgreSQL', 'sqlglot', 'FastAPI', 'React']

export default function Landing() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const heroRef   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user) navigate('/chat', { replace: true })
  }, [user, navigate])

  // Subtle parallax on mouse move
  useEffect(() => {
    const hero = heroRef.current
    if (!hero) return
    const onMove = (e: MouseEvent) => {
      const { clientX, clientY } = e
      const { innerWidth, innerHeight } = window
      const x = (clientX / innerWidth  - 0.5) * 16
      const y = (clientY / innerHeight - 0.5) * 12
      hero.style.setProperty('--mx', `${x}px`)
      hero.style.setProperty('--my', `${y}px`)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div className="min-h-dvh bg-surface-950 text-slate-100 font-sans overflow-x-hidden">

      {/* ── Ambient background ─────────────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0 bg-mesh" />
        {/* Top-left glow orb */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full
                        bg-accent-600/10 blur-[120px]" />
        {/* Bottom-right glow orb */}
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full
                        bg-violet-600/8 blur-[100px]" />
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-5
                      flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-accent flex items-center justify-center
                          shadow-glow-sm">
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight text-sm sm:text-base">
            SQL Cockpit
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/login"
            className="text-sm text-slate-400 hover:text-white transition-colors font-medium px-3 py-2"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="btn-primary text-sm px-4 py-2"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-24 pb-12 sm:pb-20
                   text-center"
        style={{ '--mx': '0px', '--my': '0px' } as React.CSSProperties}
      >
        {/* Stack badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5
                        bg-accent-500/10 border border-accent-500/25
                        text-accent-300 text-xs font-medium rounded-full mb-8
                        animate-in">
          <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-pulse" />
          Built on LangGraph · Groq · PostgreSQL · sqlglot
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight
                       leading-[1.1] mb-6 max-w-3xl mx-auto animate-in animate-in-delay-1">
          Ask your database<br className="hidden sm:block" />{' '}
          <span className="text-gradient">in plain English</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto mb-10
                      leading-relaxed animate-in animate-in-delay-2">
          Type a question. The agent selects the right tables, generates validated SQL,
          and returns a table or chart — with a human approval step before anything runs.
        </p>

        {/* CTA */}
        <div className="flex flex-col xs:flex-row items-center justify-center gap-3
                        animate-in animate-in-delay-3">
          <Link
            to="/signup"
            id="hero-cta"
            className="btn-primary text-base px-8 py-3.5 rounded-2xl w-full xs:w-auto"
          >
            Start exploring free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline ml-2">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link
            to="/login"
            className="btn-secondary text-sm px-6 py-3.5 rounded-2xl w-full xs:w-auto"
          >
            Sign in →
          </Link>
        </div>

        <p className="mt-5 text-sm text-slate-500 animate-in animate-in-delay-4">
          Free demo account · No credit card required
        </p>
      </section>

      {/* ── Product preview ────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 pb-20 sm:pb-28">
        <div className="rounded-2xl overflow-hidden border border-white/[0.10] shadow-card-float
                        animate-in animate-in-delay-2">
          {/* Browser chrome */}
          <div className="bg-surface-900 px-4 py-3 flex items-center gap-2 border-b border-white/[0.08]">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-amber-500/70" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
            <div className="flex-1 flex justify-center">
              <div className="bg-surface-950 rounded-md px-4 py-1 text-xs text-slate-500 font-mono
                              border border-white/[0.06] w-48 text-center truncate">
                sql-cockpit.app
              </div>
            </div>
          </div>

          {/* Console preview */}
          <div className="bg-surface-950 p-5 sm:p-8 font-mono text-sm min-h-[240px] sm:min-h-[320px]">
            <div className="space-y-4">
              {DEMO_LINES.map((line, i) => (
                <div
                  key={i}
                  className="flex gap-3 animate-in"
                  style={{ animationDelay: `${0.3 + i * 0.15}s` }}
                >
                  <span className="text-slate-600 flex-shrink-0 w-4 text-center">{line.prefix}</span>
                  {line.isCode ? (
                    <pre className={`${line.color} text-xs leading-relaxed whitespace-pre-wrap`}>
                      {line.text}
                    </pre>
                  ) : (
                    <span className={`${line.color} text-xs sm:text-sm`}>{line.text}</span>
                  )}
                </div>
              ))}
              {/* Blinking cursor */}
              <div className="flex gap-3 animate-in" style={{ animationDelay: '0.9s' }}>
                <span className="text-slate-600 w-4 text-center">{'>'}</span>
                <span className="inline-block w-2 h-4 bg-accent-400 animate-pulse align-middle" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-20 sm:pb-28">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            How it works
          </h2>
          <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto">
            Every query goes through a 9-node agent pipeline before a result reaches you.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="card-glow p-6 sm:p-7 animate-in group cursor-default"
              style={{ animationDelay: `${i * 0.12}s` }}
            >
              {/* Icon with glow */}
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5
                            bg-white/[0.05] ${f.color} group-hover:scale-110
                            transition-transform duration-300`}
                style={{ boxShadow: `0 0 20px ${f.glow}` }}
              >
                {f.icon}
              </div>
              <h3 className="font-semibold text-white mb-2.5 text-base">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stack strip ───────────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-white/[0.06] py-10 sm:py-12">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 text-center">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-6 font-medium">
            Built on open-source infrastructure
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            {STACK.map((s) => (
              <span
                key={s}
                className="text-sm text-slate-400 font-medium px-4 py-1.5 rounded-full
                           bg-white/[0.04] border border-white/[0.08]
                           hover:border-white/[0.16] hover:text-slate-200 transition-all duration-150"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <div className="rounded-3xl p-8 sm:p-12 text-center border border-accent-500/20
                        bg-gradient-to-br from-accent-500/10 via-surface-900 to-violet-600/8
                        shadow-glow-accent relative overflow-hidden">
          {/* Inner glow */}
          <div className="absolute inset-0 bg-mesh opacity-60 pointer-events-none" aria-hidden />
          <h2 className="relative text-2xl sm:text-3xl font-bold text-white mb-3">
            Ready to query your data?
          </h2>
          <p className="relative text-slate-400 text-sm sm:text-base mb-8 max-w-md mx-auto">
            Create a free account in seconds and start exploring your database in plain English.
          </p>
          <Link
            to="/signup"
            className="btn-primary text-base px-10 py-3.5 rounded-2xl inline-flex items-center gap-2"
          >
            Get started free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-8">
        <div className="max-w-6xl mx-auto px-5 sm:px-8
                        flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-accent flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-400">SQL Cockpit</span>
          </div>
          <p className="text-xs text-slate-600">
            LangGraph · Groq · PostgreSQL · sqlglot · FastAPI · React
          </p>
          <div className="flex items-center gap-5 text-xs text-slate-500">
            <Link to="/login"  className="hover:text-slate-300 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-slate-300 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
