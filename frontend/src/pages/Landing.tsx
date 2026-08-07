/**
 * pages/Landing.tsx
 * Design adapted from landing2.tsx reference.
 * Uses CSS tokens from tailwind.config.js (canvas, ink, muted, line, ok, warn)
 * and component classes from index.css (.pill, .dot, .card, .btn-primary, etc.)
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Database,
  Table2,
  ShieldCheck,
  UserCheck,
  Check,
  X,
  MessageSquare,
  Zap,
  Eye,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Code2,
  Layers,
  Terminal,
  ChevronDown,
} from 'lucide-react'

/* ─── Page Shell ─────────────────────────────────────────────────────────── */

export default function Landing() {
  return (
    <div className="landing-page min-h-screen font-sans antialiased">
      <Nav />
      <Hero />
      <Stats />
      <HowItWorks />
      <LiveDemo />
      <Comparison />
      <StackCredit />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  )
}

/* ─── Nav ─────────────────────────────────────────────────────────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-30 transition-all duration-300 ${
        scrolled
          ? 'border-b border-line bg-canvas/90 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: '#111214' }}>
            <Database className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight" style={{ color: '#111214' }}>SQL Cockpit</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex" style={{ color: '#5B6270' }}>
          <a href="#how" className="transition-colors" style={{ color: 'inherit' }}>How it works</a>
          <a href="#demo" className="transition-colors" style={{ color: 'inherit' }}>Live demo</a>
          <a href="#compare" className="transition-colors" style={{ color: 'inherit' }}>Compare</a>
          <a href="#faq" className="transition-colors" style={{ color: 'inherit' }}>FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className="btn-ghost text-sm">Sign in</Link>
          <Link to="/signup" className="btn-primary">Get started</Link>
        </div>
      </div>
    </header>
  )
}

/* ─── Hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="hero-grid-bg absolute inset-0" />
      <div className="hero-glow absolute inset-0" />
      <div className="animate-float absolute -left-10 top-32 hidden h-24 w-24 rounded-full bg-accent-600/8 blur-2xl lg:block" />
      <div className="animate-float-delayed absolute -right-10 top-48 hidden h-32 w-32 rounded-full bg-accent-600/10 blur-3xl lg:block" />

      <div className="relative mx-auto max-w-page px-6 pt-20 pb-16 text-center">
        <span className="pill animate-fade-up">
          <span className="dot animate-pulse-dot" style={{ backgroundColor: '#15803d' }} />
          LangGraph · Groq · PostgreSQL · sqlglot
        </span>

        <h1
          className="mx-auto mt-6 max-w-3xl animate-fade-up text-4xl font-semibold leading-tight tracking-tight sm:text-6xl"
          style={{ color: '#111214', animationDelay: '0.05s' }}
        >
          Ask your database a question{' '}
          <span className="animate-gradient-pan bg-gradient-to-r from-accent-600 to-cyan-500 bg-clip-text text-transparent">
            in plain English
          </span>
        </h1>

        <p
          className="mx-auto mt-5 max-w-xl animate-fade-up text-base leading-relaxed sm:text-lg"
          style={{ color: '#5B6270', animationDelay: '0.1s' }}
        >
          SQL Cockpit selects the relevant tables, writes SQL, and shows it to you before running
          anything. Approve it, and it returns the results as a table or chart — with a plain-English
          summary of what it found.
        </p>

        <div
          className="mt-8 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: '0.15s' }}
        >
          <Link to="/signup" className="btn-primary w-full sm:w-auto">
            Start for free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="btn-outline w-full sm:w-auto">
            Sign in
          </Link>
        </div>

        <p className="mt-3 animate-fade-up text-xs" style={{ animationDelay: '0.2s', color: '#5B6270' }}>
          No credit card required · Demo database included
        </p>

        {/* Browser-chrome preview with typing demo */}
        <div
          className="mx-auto mt-14 max-w-4xl animate-fade-up overflow-hidden rounded-xl border border-line bg-white shadow-hair"
          style={{ animationDelay: '0.25s' }}
        >
          <div className="flex items-center gap-2 border-b border-line bg-canvas px-4 py-3">
            <span className="dot bg-[#FF5F57]" />
            <span className="dot bg-[#FEBC2E]" />
            <span className="dot bg-[#28C840]" />
            <div className="ml-3 flex-1">
              <div className="mx-auto max-w-md rounded-md border border-line bg-white px-3 py-1 text-center text-xs text-muted">
                cockpit.app/console
              </div>
            </div>
          </div>
          <div className="aspect-[16/9]" style={{ background: 'linear-gradient(to bottom, #FAFAF9, #ffffff)' }}>
            <TypingDemo />
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Typing Demo ─────────────────────────────────────────────────────────── */

function TypingDemo() {
  const question = 'Which 5 customers spent the most last quarter?'
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<'typing' | 'thinking' | 'done'>('typing')

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      i++
      setTyped(question.slice(0, i))
      if (i >= question.length) {
        clearInterval(interval)
        setTimeout(() => setPhase('thinking'), 400)
        setTimeout(() => setPhase('done'), 2000)
      }
    }, 45)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-full flex-col gap-3 p-5 text-left sm:p-7">
      {/* User bubble */}
      <div
        className="ml-auto max-w-md self-end rounded-2xl rounded-br-sm px-4 py-2.5 text-sm"
        style={{ backgroundColor: '#111214', color: '#ffffff' }}
      >
        {typed}
        {phase === 'typing' && <span className="animate-blink">|</span>}
      </div>

      {/* Thinking indicator */}
      {phase === 'thinking' && (
        <div
          className="flex max-w-md items-center gap-2 rounded-2xl rounded-bl-sm border px-4 py-3 animate-fade-in"
          style={{ borderColor: '#e5e7eb', backgroundColor: '#ffffff', color: '#5B6270' }}
        >
          <span className="flex gap-1">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent-600" style={{ animationDelay: '0s' }} />
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent-600" style={{ animationDelay: '0.2s' }} />
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-accent-600" style={{ animationDelay: '0.4s' }} />
          </span>
          <span className="text-xs">Selecting tables, writing SQL…</span>
        </div>
      )}

      {/* Response */}
      {phase === 'done' && (
        <>
          <div
            className="max-w-md animate-slide-in-left rounded-2xl rounded-bl-sm border px-4 py-3"
            style={{ borderColor: '#e5e7eb', backgroundColor: '#ffffff', color: '#111214' }}
          >
            <p className="text-xs" style={{ color: '#5B6270' }}>Selecting tables: invoices, customers</p>
            <p className="mt-1 flex items-center gap-1 text-xs" style={{ color: '#15803d' }}>
              <Check className="h-3 w-3" /> AST validated · read-only transaction
            </p>
            <pre
              className="mt-2 overflow-hidden rounded-md px-3 py-2 font-mono text-[11px] leading-relaxed"
              style={{ backgroundColor: '#111214', color: 'rgba(255,255,255,0.9)' }}
            >
{`SELECT c.FullName, SUM(i.Total) AS spend
FROM Invoice i
JOIN Customer c ON c.CustomerId = i.CustomerId
WHERE i.InvoiceDate >= '2024-01-01'
GROUP BY c.FullName
ORDER BY spend DESC
LIMIT 5;`}
            </pre>
          </div>
          <div className="max-w-md animate-fade-up overflow-hidden rounded-lg border" style={{ borderColor: '#e5e7eb', animationDelay: '0.3s' }}>
            <div className="grid grid-cols-2 text-xs" style={{ gap: '1px', backgroundColor: '#e5e7eb' }}>
              <div className="px-3 py-2 font-medium" style={{ backgroundColor: '#ffffff', color: '#111214' }}>Customer</div>
              <div className="px-3 py-2 text-right font-medium" style={{ backgroundColor: '#ffffff', color: '#111214' }}>Spend</div>
              <div className="px-3 py-2" style={{ backgroundColor: '#ffffff', color: '#5B6270' }}>Helena Holý</div>
              <div className="px-3 py-2 text-right" style={{ backgroundColor: '#ffffff', color: '#5B6270' }}>$49.80</div>
              <div className="px-3 py-2" style={{ backgroundColor: '#ffffff', color: '#5B6270' }}>Richard Cunningham</div>
              <div className="px-3 py-2 text-right" style={{ backgroundColor: '#ffffff', color: '#5B6270' }}>$47.62</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Stats Strip ─────────────────────────────────────────────────────────── */

function Stats() {
  const stats = [
    { value: '3-layer', label: 'Validation pipeline' },
    { value: '0', label: 'Queries run without approval' },
    { value: '< 2s', label: 'From question to SQL' },
    { value: '100%', label: 'Read-only by default' },
  ]
  return (
    <section className="border-y border-line bg-white">
      <div className="mx-auto grid max-w-page grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="bg-white px-6 py-8 text-center animate-fade-up"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <p className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─── How It Works ────────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      icon: <MessageSquare className="h-5 w-5" />,
      step: '01',
      title: 'Ask in plain English',
      desc: 'Type a question like you would ask a colleague. No SQL syntax, no table names to memorize.',
    },
    {
      icon: <Layers className="h-5 w-5" />,
      step: '02',
      title: 'Agent selects tables',
      desc: 'The LangGraph agent reads your schema and picks only the tables that matter — it never guesses blindly.',
    },
    {
      icon: <Code2 className="h-5 w-5" />,
      step: '03',
      title: 'SQL is generated & validated',
      desc: 'Every query is parsed with sqlglot, checked for safety, and marked read-only before you ever see it.',
    },
    {
      icon: <UserCheck className="h-5 w-5" />,
      step: '04',
      title: 'You approve, it runs',
      desc: 'See the exact SQL, approve it, and get results as a table or chart with a plain-English summary.',
    },
  ]

  return (
    <section id="how" className="border-b border-line bg-canvas">
      <div className="mx-auto max-w-page px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="pill animate-fade-up">
            <Sparkles className="h-3 w-3 text-accent-600" /> How it works
          </span>
          <h2
            className="mt-5 animate-fade-up text-3xl font-semibold tracking-tight text-ink"
            style={{ animationDelay: '0.05s' }}
          >
            Four steps from question to answer
          </h2>
          <p className="mt-3 animate-fade-up text-sm text-muted" style={{ animationDelay: '0.1s' }}>
            Every query goes through a structured pipeline — so you get accurate results, not confident guesses.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div
              key={s.step}
              className="card-light animate-fade-up p-6 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong hover:shadow-hair"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-600/10 text-accent-600">
                  {s.icon}
                </span>
                <span className="font-mono text-xs font-semibold text-line-strong">{s.step}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Feature deep-dive cards */}
        <div className="mt-6 grid animate-fade-up gap-6 md:grid-cols-3" style={{ animationDelay: '0.1s' }}>
          <FeatureCard
            icon={<Table2 className="h-4 w-4" />}
            title="Schema-aware table selection"
            desc="The agent reads your schema and picks only the tables that matter, so it doesn't guess blindly."
          >
            <SchemaMock />
          </FeatureCard>
          <FeatureCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title="AST validation before execution"
            desc="Every query is parsed with sqlglot and checked for read-only safety before it ever touches your database."
          >
            <ChecklistMock />
          </FeatureCard>
          <FeatureCard
            icon={<UserCheck className="h-4 w-4" />}
            title="Human approval checkpoint"
            desc="You see the SQL and approve it before it runs. Nothing executes without your explicit sign-off."
          >
            <ApprovalMock />
          </FeatureCard>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  children: React.ReactNode
}) {
  return (
    <div className="card-light p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted">
        {icon}
      </span>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
      <div className="mt-4">{children}</div>
    </div>
  )
}

function SchemaMock() {
  const rows = [
    { name: 'invoices', match: 'high' },
    { name: 'customers', match: 'high' },
    { name: 'employees', match: 'low' },
    { name: 'tracks', match: 'low' },
  ]
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="grid grid-cols-2 gap-px bg-line text-xs">
        <div className="bg-canvas px-3 py-2 font-medium text-muted">table</div>
        <div className="bg-canvas px-3 py-2 text-right font-medium text-muted">match</div>
        {rows.map((r) => (
          <div key={r.name} className="contents">
            <div className="bg-white px-3 py-2 font-mono text-[11px] text-ink">{r.name}</div>
            <div className={`px-3 py-2 text-right text-[11px] font-medium ${r.match === 'high' ? 'text-ok' : 'text-muted'}`}>
              {r.match}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChecklistMock() {
  const items = ['Syntax check', 'Read-only guard', 'Schema match']
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it} className="flex items-center gap-2 text-sm text-ink">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok-soft text-ok">
            <Check className="h-3 w-3" />
          </span>
          {it}
        </li>
      ))}
    </ul>
  )
}

function ApprovalMock() {
  return (
    <div className="rounded-lg border border-warn/40 bg-warn-soft p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-warn">
        <span className="dot bg-warn" /> Pending approval
      </div>
      <pre className="mt-2 overflow-hidden rounded-md bg-ink px-3 py-2 font-mono text-[10px] leading-relaxed text-white/90">
{`SELECT * FROM large_events_log
WHERE created_at > '2024-01-01';`}
      </pre>
      <div className="mt-3 flex gap-2">
        <button className="btn-dark flex-1 py-1.5 text-xs">Approve</button>
        <button className="btn-outline flex-1 py-1.5 text-xs">
          <X className="h-3 w-3" /> Reject
        </button>
      </div>
    </div>
  )
}

/* ─── Live Demo ───────────────────────────────────────────────────────────── */

const exampleSQL: string[] = [
  `SELECT c.FullName, SUM(i.Total) AS spend
FROM Invoice i
JOIN Customer c ON c.CustomerId = i.CustomerId
GROUP BY c.FullName
ORDER BY spend DESC
LIMIT 10;`,
  `SELECT
  DATE_TRUNC('month', InvoiceDate) AS month,
  SUM(Total) AS revenue
FROM Invoice
WHERE InvoiceDate >= NOW() - INTERVAL '12 months'
GROUP BY month
ORDER BY month;`,
  `SELECT g.Name AS genre, SUM(il.Quantity) AS units
FROM InvoiceLine il
JOIN Track t ON t.TrackId = il.TrackId
JOIN Genre g ON g.GenreId = t.GenreId
JOIN Invoice i ON i.InvoiceId = il.InvoiceId
JOIN Customer c ON c.CustomerId = i.CustomerId
WHERE c.Country IN ('Germany','France','UK')
GROUP BY g.Name
ORDER BY units DESC;`,
  `SELECT FirstName, LastName, HireDate, Title
FROM Employee
WHERE HireDate >= '2010-01-01'
ORDER BY HireDate;`,
  `SELECT BillingCountry, AVG(Total) AS avg_invoice
FROM Invoice
GROUP BY BillingCountry
ORDER BY avg_invoice DESC;`,
  `SELECT Email, COUNT(*) AS occurrences
FROM Customer
GROUP BY Email
HAVING COUNT(*) > 1;`,
]

function LiveDemo() {
  const examples = [
    'Top 10 customers by total spend',
    'Monthly revenue trend last 12 months',
    'Which genres sell best in Europe?',
    'List employees hired after 2010',
    'Average invoice size by country',
    'Find duplicate customer emails',
  ]
  const [active, setActive] = useState(0)

  return (
    <section id="demo" className="border-b border-line bg-white">
      <div className="mx-auto max-w-page px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="pill animate-fade-up">
            <Terminal className="h-3 w-3 text-accent-600" /> Try the demo
          </span>
          <h2 className="mt-5 animate-fade-up text-3xl font-semibold tracking-tight text-ink" style={{ animationDelay: '0.05s' }}>
            See what it can answer
          </h2>
          <p className="mt-3 animate-fade-up text-sm text-muted" style={{ animationDelay: '0.1s' }}>
            These are real questions SQL Cockpit handles against the sample Chinook database. Click any to see the generated SQL.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Example picker */}
          <div className="space-y-2">
            {examples.map((q, i) => (
              <button
                key={q}
                onClick={() => setActive(i)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all duration-200 ${
                  active === i
                    ? 'border-accent-600 bg-accent-600/5 text-ink'
                    : 'border-line bg-white text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono ${
                  active === i ? 'bg-accent-600 text-white' : 'bg-canvas text-muted'
                }`}>
                  {i + 1}
                </span>
                <span className="flex-1">{q}</span>
                <ArrowRight className={`h-4 w-4 shrink-0 transition-transform ${
                  active === i ? 'translate-x-0 text-accent-600' : '-translate-x-1 opacity-0'
                }`} />
              </button>
            ))}
          </div>

          {/* SQL output */}
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: '#e5e7eb', backgroundColor: '#111214', color: '#ffffff' }}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
            >
              <span className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <Code2 className="h-3.5 w-3.5" /> Generated SQL
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: '#dcfce7', color: '#15803d' }}
              >
                <ShieldCheck className="h-3 w-3" /> Valid
              </span>
            </div>
            <div className="p-4">
              <pre
                className="overflow-x-auto font-mono text-xs leading-relaxed animate-fade-in"
                key={active}
                style={{ color: 'rgba(255,255,255,0.9)' }}
              >
                {exampleSQL[active]}
              </pre>
            </div>
            <div
              className="flex items-center gap-2 px-4 py-2.5 text-xs"
              style={{ borderTop: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
            >
              <Zap className="h-3 w-3" style={{ color: '#2563eb' }} /> read-only · validated by sqlglot
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Comparison ──────────────────────────────────────────────────────────── */

function Comparison() {
  const features = [
    { label: 'Plain-English questions', us: true, them: false },
    { label: 'Schema-aware table selection', us: true, them: false },
    { label: 'AST validation before execution', us: true, them: false },
    { label: 'Human approval checkpoint', us: true, them: false },
    { label: 'Read-only by default', us: true, them: 'partial' as const },
    { label: 'Plain-English result summary', us: true, them: false },
    { label: 'Works with your existing PostgreSQL', us: true, them: true },
    { label: 'No SQL knowledge required', us: true, them: false },
  ]

  return (
    <section id="compare" className="border-b border-line bg-canvas">
      <div className="mx-auto max-w-page px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="pill animate-fade-up">
            <TrendingUp className="h-3 w-3 text-accent-600" /> Why SQL Cockpit
          </span>
          <h2 className="mt-5 animate-fade-up text-3xl font-semibold tracking-tight text-ink" style={{ animationDelay: '0.05s' }}>
            Built for teams that can't afford wrong data
          </h2>
        </div>

        <div className="mx-auto mt-12 max-w-3xl animate-fade-up overflow-hidden rounded-xl border border-line" style={{ animationDelay: '0.1s' }}>
          <div className="grid grid-cols-3 gap-px bg-line">
            <div className="bg-white px-4 py-4 text-sm font-medium text-muted">Feature</div>
            <div className="bg-accent-600/5 px-4 py-4 text-center text-sm font-semibold text-accent-600">SQL Cockpit</div>
            <div className="bg-white px-4 py-4 text-center text-sm font-medium text-muted">Generic AI chat</div>
          </div>
          {features.map((f) => (
            <div key={f.label} className="grid grid-cols-3 gap-px bg-line">
              <div className="bg-white px-4 py-3.5 text-sm text-ink">{f.label}</div>
              <div className="flex items-center justify-center bg-accent-600/5 px-4 py-3.5">
                <Check className="h-4 w-4 text-ok" />
              </div>
              <div className="flex items-center justify-center bg-white px-4 py-3.5">
                {f.them === true ? (
                  <Check className="h-4 w-4 text-muted" />
                ) : f.them === 'partial' ? (
                  <span className="text-xs text-muted">Partial</span>
                ) : (
                  <X className="h-4 w-4 text-muted/40" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Stack Credit ────────────────────────────────────────────────────────── */

function StackCredit() {
  const stack = [
    { name: 'LangGraph', desc: 'Agent orchestration' },
    { name: 'Groq', desc: 'Fast inference' },
    { name: 'PostgreSQL', desc: 'Your database' },
    { name: 'sqlglot', desc: 'SQL parsing & validation' },
    { name: 'FastAPI', desc: 'Backend API' },
    { name: 'React', desc: 'Console UI' },
  ]
  return (
    <section className="border-b border-line bg-white">
      <div className="mx-auto max-w-page px-6 py-12">
        <p className="text-center text-xs font-medium uppercase tracking-wider text-muted">Built with</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {stack.map((s, i) => (
            <span
              key={s.name}
              className="pill animate-fade-up transition-transform hover:scale-105"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="font-medium text-ink">{s.name}</span>
              <span className="text-muted">· {s.desc}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}



/* ─── FAQ ─────────────────────────────────────────────────────────────────── */

function FAQ() {
  const faqs = [
    {
      q: 'Does SQL Cockpit write to my database?',
      a: 'No. Every query runs inside a read-only transaction by default. The agent cannot INSERT, UPDATE, or DELETE — even if you wanted it to.',
    },
    {
      q: 'What databases are supported?',
      a: 'Any PostgreSQL-compatible database. Connect with a standard connection string and the agent reads your schema automatically.',
    },
    {
      q: 'Can the agent run a query without my approval?',
      a: 'No. The human approval checkpoint is mandatory — nothing executes until you click Approve. You see the exact SQL first.',
    },
    {
      q: 'Does my data leave my database?',
      a: 'Only the schema (table and column names) is sent to the LLM to generate SQL. Your actual row data never leaves your database — only query results are returned to your browser.',
    },
    {
      q: 'What if the agent picks the wrong tables?',
      a: 'You see the selected tables in the reasoning panel before approving. If they look wrong, reject and rephrase your question.',
    },
  ]
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section id="faq" className="border-b border-line bg-white">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <div className="text-center">
          <span className="pill animate-fade-up">
            <Eye className="h-3 w-3 text-accent-600" /> FAQ
          </span>
          <h2 className="mt-5 animate-fade-up text-3xl font-semibold tracking-tight text-ink" style={{ animationDelay: '0.05s' }}>
            Questions, answered
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-lg border border-line bg-white">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-ink"
              >
                {f.q}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`}
                />
              </button>
              {open === i && (
                <div className="animate-fade-in border-t border-line px-5 py-4 text-sm leading-relaxed text-muted">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Final CTA ───────────────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: '#111214' }}>
      <div className="hero-glow absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-page px-6 py-24 text-center animate-fade-up">
        <Sparkles className="mx-auto h-8 w-8" style={{ color: '#2563eb' }} />
        <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: '#ffffff' }}>
          Ready to query your data?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Create a free account — a demo database is included, and there's no setup required.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/signup" className="btn-primary w-full sm:w-auto">
            Create a free account <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150"
            style={{ border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', backgroundColor: 'transparent' }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ─── Footer ──────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #e5e7eb', backgroundColor: '#FAFAF9' }}>
      <div className="mx-auto flex max-w-page flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#111214', color: '#ffffff' }}
          >
            <Database className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold" style={{ color: '#111214' }}>SQL Cockpit</span>
          <nav className="ml-4 flex items-center gap-4 text-sm" style={{ color: '#5B6270' }}>
            <a href="#how" className="transition-colors hover:text-[#111214]">How it works</a>
            <a href="#" className="transition-colors hover:text-[#111214]">GitHub</a>
            <a href="#" className="transition-colors hover:text-[#111214]">Docs</a>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link to="/login" className="transition-colors hover:text-[#111214]" style={{ color: '#5B6270' }}>Sign in</Link>
          <Link to="/signup" className="btn-primary">Sign up</Link>
        </div>
      </div>
    </footer>
  )
}
