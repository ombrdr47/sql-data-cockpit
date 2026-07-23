/**
 * pages/Landing.tsx
 * Clean marketing page per UI.md:
 * - No fake latency numbers or hardcoded metrics
 * - One primary CTA
 * - Real stack attribution only (LangGraph, Groq, PostgreSQL, sqlglot)
 * - No terminal cosplay, no bracket notation
 */
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const FEATURES = [
  {
    title: 'Schema pruning',
    description:
      'Before generating SQL, the agent selects only the tables relevant to your question — so the model reasons over a focused, accurate context instead of your entire schema.',
    icon: '⊙',
  },
  {
    title: 'Safety validation',
    description:
      'Every query is checked against a syntax validator before it runs. Queries are also executed in read-only mode, so no data can be modified — ever.',
    icon: '◈',
  },
  {
    title: 'Human approval',
    description:
      'Complex or ambiguous queries pause and show you the generated SQL before execution. You review, edit, or reject — then the agent continues.',
    icon: '◇',
  },
]

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/chat', { replace: true })
  }, [user, navigate])

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-accent-500 rounded-md flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-neutral-900 tracking-tight">SQL Cockpit</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors font-medium"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="text-sm bg-neutral-900 hover:bg-neutral-700 text-white font-medium
                       px-4 py-2 rounded-lg transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent-50 border border-accent-200
                        text-accent-700 text-xs font-medium rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-accent-500 rounded-full" />
          Built on LangGraph · Groq · PostgreSQL · sqlglot
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 tracking-tight leading-tight mb-6 max-w-3xl mx-auto">
          Ask your database a question
          <span className="block text-gradient bg-gradient-to-r from-accent-500 to-violet-500
                           bg-clip-text text-transparent">
            in plain English
          </span>
        </h1>

        <p className="text-lg text-neutral-500 max-w-xl mx-auto mb-10 leading-relaxed">
          Type a question. The agent selects the right tables, generates validated SQL,
          and returns a table or chart — with a human approval step before anything runs.
        </p>

        <Link
          to="/signup"
          id="hero-cta"
          className="inline-flex items-center gap-2 bg-accent-500 hover:bg-accent-600 text-white
                     font-semibold text-base px-8 py-3.5 rounded-xl transition-all duration-150
                     shadow-lg shadow-accent-500/25 active:scale-[0.98]"
        >
          Start exploring
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>

        <p className="mt-4 text-sm text-neutral-400">
          Free demo account available — no credit card required.
        </p>
      </section>

      {/* ── Product screenshot ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-2xl overflow-hidden border border-neutral-200 shadow-2xl shadow-neutral-900/10">
          <div className="bg-neutral-100 px-4 py-3 flex items-center gap-2 border-b border-neutral-200">
            <span className="w-3 h-3 rounded-full bg-neutral-300" />
            <span className="w-3 h-3 rounded-full bg-neutral-300" />
            <span className="w-3 h-3 rounded-full bg-neutral-300" />
          </div>
          <img
            src="/console-screenshot.png"
            alt="SQL Cockpit console showing a natural language query and its results"
            className="w-full block bg-surface-950"
            onError={(e) => {
              // Fallback: hide image and show placeholder
              const el = e.currentTarget
              el.style.display = 'none'
              const parent = el.parentElement
              if (parent) {
                const placeholder = document.createElement('div')
                placeholder.className = 'bg-surface-950 h-80 flex items-center justify-center text-slate-600 text-sm font-mono'
                placeholder.textContent = '← deploy and screenshot the live app here →'
                parent.appendChild(placeholder)
              }
            }}
          />
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold text-neutral-900 text-center mb-12">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm
                         hover:shadow-md hover:border-neutral-300 transition-all duration-200 animate-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="text-2xl mb-4 text-accent-500">{f.icon}</div>
              <h3 className="font-semibold text-neutral-900 mb-2">{f.title}</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-200 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-accent-500 rounded flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-sm font-medium text-neutral-600">SQL Cockpit</span>
          </div>
          <p className="text-xs text-neutral-400">
            Built with LangGraph · Groq · PostgreSQL · sqlglot
          </p>
          <div className="flex items-center gap-4 text-xs text-neutral-400">
            <Link to="/login" className="hover:text-neutral-700 transition-colors">Sign in</Link>
            <Link to="/signup" className="hover:text-neutral-700 transition-colors">Sign up</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
