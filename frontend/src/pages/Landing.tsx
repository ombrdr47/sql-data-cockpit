/**
 * pages/Landing.tsx
 * Obsidian Cyber-Terminal (Enterprise Data Cockpit v2)
 * Authentic database engineering aesthetic with schema topology previews, AST diagnostic logs, and technical telemetry framing.
 */
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../lib/auth'

const DIAGNOSTIC_QUERIES = [
  {
    prompt: "Show me the top 5 artists by track count",
    prunedTables: ["Artist (11 cols)", "Album (3 cols)", "Track (8 cols)"],
    excludedTables: ["Invoice", "Customer", "Employee", "Playlist"],
    sql: "SELECT Artist.Name, COUNT(Track.TrackId) AS TrackCount FROM Artist JOIN Album ON Artist.ArtistId = Album.ArtistId JOIN Track ON Album.AlbumId = Track.AlbumId GROUP BY Artist.ArtistId ORDER BY TrackCount DESC LIMIT 5;",
    latency: "142ms",
    rows: [
      { artist: "Iron Maiden", tracks: 213 },
      { artist: "U2", tracks: 135 },
      { artist: "Led Zeppelin", tracks: 114 },
      { artist: "Metallica", tracks: 112 },
      { artist: "Lost", tracks: 92 },
    ]
  },
  {
    prompt: "Plot total sales revenue by country as a bar chart",
    prunedTables: ["Invoice (9 cols)", "Customer (13 cols)"],
    excludedTables: ["Track", "Artist", "Playlist", "Genre"],
    sql: "SELECT Customer.Country, ROUND(SUM(Invoice.Total), 2) AS TotalRevenue FROM Invoice JOIN Customer ON Invoice.CustomerId = Customer.CustomerId GROUP BY Customer.Country ORDER BY TotalRevenue DESC LIMIT 5;",
    latency: "189ms",
    rows: [
      { artist: "USA", tracks: "$523.06" },
      { artist: "Canada", tracks: "$303.96" },
      { artist: "France", tracks: "$195.10" },
      { artist: "Brazil", tracks: "$190.10" },
      { artist: "Germany", tracks: "$156.48" },
    ]
  },
  {
    prompt: "Which genres have more than 100 tracks in the catalog?",
    prunedTables: ["Genre (2 cols)", "Track (8 cols)"],
    excludedTables: ["Invoice", "Artist", "Album", "Customer"],
    sql: "SELECT Genre.Name, COUNT(Track.TrackId) AS TotalTracks FROM Genre JOIN Track ON Genre.GenreId = Track.GenreId GROUP BY Genre.GenreId HAVING COUNT(Track.TrackId) > 100 ORDER BY TotalTracks DESC;",
    latency: "118ms",
    rows: [
      { artist: "Rock", tracks: 1297 },
      { artist: "Latin", tracks: 579 },
      { artist: "Metal", tracks: 374 },
      { artist: "Alternative & Punk", tracks: 332 },
      { artist: "Jazz", tracks: 130 },
    ]
  }
]

export default function Landing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [queryIndex, setQueryIndex] = useState(0)

  // Rotate diagnostic queries
  useEffect(() => {
    const timer = setInterval(() => {
      setQueryIndex((prev) => (prev + 1) % DIAGNOSTIC_QUERIES.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const currentQ = DIAGNOSTIC_QUERIES[queryIndex]

  return (
    <div className="min-h-screen bg-surface-950 text-slate-100 relative overflow-x-hidden selection:bg-brand-500 selection:text-surface-950 font-sans">
      {/* ── Background Technical Grid & Spec Lines ───────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1c1f26_1px,transparent_1px),linear-gradient(to_bottom,#1c1f26_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
        <div className="absolute top-0 left-[10%] w-[1px] h-full bg-slate-800/60" />
        <div className="absolute top-0 right-[10%] w-[1px] h-full bg-slate-800/60" />
        {/* Subtle orange/amber ambient glow */}
        <div className="absolute top-[15%] left-[25%] w-[500px] h-[500px] bg-brand-600/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-[10%] right-[20%] w-[400px] h-[400px] bg-emerald-600/5 rounded-full blur-[140px]" />
      </div>

      {/* ── Top Diagnostic Header Bar ────────────────────────────────────────── */}
      <header className="relative z-20 border-b border-slate-800 bg-surface-950/90 backdrop-blur-md sticky top-0 font-mono text-xs">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center text-surface-950 font-bold shadow-[0_0_12px_rgba(255,107,0,0.4)]">
              SQL
            </div>
            <div className="flex flex-col">
              <span className="font-bold tracking-tight text-white flex items-center gap-2 uppercase">
                Chinook <span className="text-brand-500">// DATA COCKPIT v2</span>
              </span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SYS_STATUS: ONLINE // POSTGRESQL_15 // RAG_PRUNER_ACTIVE
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-slate-400">
            <a href="#diagnostic" className="hover:text-brand-400 transition-colors">[01_DIAGNOSTICS]</a>
            <a href="#architecture" className="hover:text-brand-400 transition-colors">[02_AST_ENGINE]</a>
            <a href="#sandbox" className="hover:text-brand-400 transition-colors">[03_SANDBOX_SECURITY]</a>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={() => navigate('/chat')}
                className="btn-primary flex items-center gap-2 py-2 px-4 text-xs"
              >
                <span>[OPEN_COCKPIT]</span>
                <span>→</span>
              </button>
            ) : (
              <>
                <Link to="/login" className="btn-ghost text-xs py-2 px-3">[LOGIN_TERMINAL]</Link>
                <Link
                  to="/signup"
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  <span>[INITIALIZE_AGENT]</span>
                  <span className="text-surface-950 font-bold">⚡</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ─────────────────────────────────────────────────────── */}
      <main className="relative z-10">
        <section className="pt-20 pb-16 px-6 max-w-6xl mx-auto">
          {/* Top telemetry index */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-10 font-mono text-xs text-slate-500 uppercase">
            <span>[SYS_ID: CHINOOK_LANGGRAPH_01]</span>
            <span className="text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              ZERO_HALLUCINATION_GUARD: ENABLED
            </span>
            <span>[DIALECT: ANSI_SQL / PG]</span>
          </div>

          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-3 py-1 bg-surface-900 border border-slate-800 text-brand-400 text-xs font-mono mb-6 uppercase tracking-wider"
            >
              <span>⚡</span>
              <span>Autonomous SQL Data Engineering Instrument</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-6 font-mono"
            >
              Turn natural queries into <span className="text-brand-500 underline decoration-slate-800 underline-offset-8">precision SQL diagnostics</span> & visual analytics.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-base md:text-lg text-slate-400 max-w-2xl mb-10 leading-relaxed font-sans"
            >
              An enterprise data cockpit that dynamically prunes schema tokens, self-corrects via AST syntax compilation, and executes complex analytics inside an isolated Python subprocess sandbox.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4 mb-16 font-mono text-xs"
            >
              <button
                onClick={() => navigate(user ? '/chat' : '/signup')}
                className="btn-primary py-3.5 px-6 text-sm flex items-center gap-2 group"
              >
                <span>[INITIALIZE_COCKPIT]</span>
                <span className="group-hover:translate-x-1 transition-transform">→</span>
              </button>
              <a
                href="#diagnostic"
                className="btn-ghost py-3.5 px-6 text-sm flex items-center gap-2"
              >
                <span>[VIEW_AST_DIAGNOSTICS]</span>
              </a>
            </motion.div>
          </div>

          {/* ── Live Interactive Schema Topology & Diagnostic Terminal ──────────── */}
          <motion.div
            id="diagnostic"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="border border-slate-800 bg-surface-900 rounded-md shadow-2xl overflow-hidden relative"
          >
            {/* Corner crosshairs decoration */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-brand-500 z-30" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-brand-500 z-30" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-brand-500 z-30" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-brand-500 z-30" />

            {/* Terminal Titlebar */}
            <div className="bg-surface-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-3">
                <span className="text-brand-500 font-bold">/// DIAGNOSTIC_TERMINAL_V2</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">TARGET: chinook_music_store.postgresql</span>
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <span>LATENCY: <strong className="text-emerald-400">{currentQ.latency}</strong></span>
                <span>AST_STATUS: <strong className="text-emerald-400">VERIFIED_OK</strong></span>
                <span className="w-2 h-2 rounded-full bg-brand-500 animate-ping" />
              </div>
            </div>

            {/* Terminal Body Grid */}
            <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
              {/* Left Column: Schema Pruning Topology & Prompt */}
              <div className="lg:col-span-5 p-6 bg-surface-900/50 flex flex-col justify-between font-mono text-xs">
                <div className="space-y-6">
                  <div>
                    <div className="text-slate-500 uppercase tracking-wider mb-2 text-[10px]">[01_INPUT_PROMPT]</div>
                    <div className="bg-surface-950 border border-slate-800 p-3 rounded text-brand-300 font-medium">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={queryIndex}
                          initial={{ opacity: 0, x: -5 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 5 }}
                          transition={{ duration: 0.2 }}
                        >
                          &gt; "{currentQ.prompt}"
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Schema topology tree */}
                  <div>
                    <div className="text-slate-500 uppercase tracking-wider mb-2 text-[10px]">[02_DYNAMIC_SCHEMA_PRUNER]</div>
                    <div className="space-y-1.5 bg-surface-950 p-3 rounded border border-slate-800">
                      <div className="text-[11px] text-slate-400 mb-2">Selected Catalog Nodes (Token Optimized):</div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentQ.prunedTables.map((t, idx) => (
                          <span key={idx} className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                            <span className="text-emerald-400">✓</span> {t}
                          </span>
                        ))}
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-1.5 opacity-40">
                        {currentQ.excludedTables.map((t, idx) => (
                          <span key={idx} className="bg-surface-900 text-slate-400 px-2 py-0.5 rounded text-[10px] border border-slate-800">
                            ✗ {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800/80 mt-6 flex items-center justify-between text-[11px] text-slate-500">
                  <span>PRUNING_EFFICIENCY: 78% TOKEN SAVINGS</span>
                  <span className="text-brand-400 font-bold">RAG_OK</span>
                </div>
              </div>

              {/* Right Column: AST Compilation & Subprocess Output */}
              <div className="lg:col-span-7 p-6 bg-surface-950 flex flex-col justify-between font-mono text-xs">
                <div className="space-y-6">
                  {/* SQL AST output */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-500 uppercase tracking-wider text-[10px]">[03_AST_COMPILED_SQL]</span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">0 SYNTAX ERRORS // SELF_CORRECTED</span>
                    </div>
                    <div className="bg-surface-900 border border-slate-800 p-3 rounded text-emerald-400 text-xs overflow-x-auto leading-relaxed">
                      <code>{currentQ.sql}</code>
                    </div>
                  </div>

                  {/* High speed grid simulation */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-500 uppercase tracking-wider text-[10px]">[04_SUBPROCESS_SANDBOX_RESULT]</span>
                      <span className="text-[10px] text-brand-400">TANSTACK_HIGH_SPEED_GRID // PLOTLY_SERIALIZED</span>
                    </div>
                    <div className="border border-slate-800 rounded overflow-hidden bg-surface-900/50">
                      <div className="bg-surface-850 px-3 py-1.5 border-b border-slate-800 text-[11px] font-bold text-slate-300 flex justify-between">
                        <span>{queryIndex === 1 ? "COUNTRY_NAME" : "ARTIST_NAME"}</span>
                        <span>{queryIndex === 1 ? "TOTAL_REVENUE_USD" : "TRACK_COUNT_METRIC"}</span>
                      </div>
                      <div className="divide-y divide-slate-800/60 text-[11px]">
                        {currentQ.rows.map((r, idx) => (
                          <div key={idx} className="px-3 py-1.5 flex justify-between items-center hover:bg-surface-850 transition-colors">
                            <span className="text-slate-200">{r.artist}</span>
                            <span className="text-brand-400 font-bold">{r.tracks}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800 mt-6 flex items-center justify-between text-[11px] text-slate-500">
                  <span>EXECUTION_CONTAINER: ISOLATED_PYTHON_SUBPROCESS</span>
                  <span className="text-emerald-400 font-bold">STATUS: COMPLETED</span>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ── Architecture & Technical Capabilities ──────────────────────────── */}
        <section id="architecture" className="py-20 px-6 max-w-6xl mx-auto border-t border-slate-800 font-mono">
          <div className="mb-12">
            <span className="text-xs text-brand-500 font-bold uppercase tracking-widest block mb-2">// SYSTEM_MODULES & SPECIFICATIONS</span>
            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight font-sans">
              Engineered for absolute accuracy, safety, and speed.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="terminal-panel p-6 border-slate-800 hover:border-brand-500/50 transition-colors group">
              <div className="text-xs text-brand-500 font-bold mb-3">[MOD_01: SCHEMA_PRUNING]</div>
              <h3 className="text-lg font-bold text-white mb-3 font-sans">Dynamic RAG Catalog Pruning</h3>
              <p className="text-slate-400 text-xs leading-relaxed font-sans">
                Large enterprise databases exceed LLM context windows. Our pruning engine analyzes semantic intent and foreign key constraints to inject only the relevant table DDLs and sample rows per query.
              </p>
            </div>

            <div className="terminal-panel p-6 border-slate-800 hover:border-brand-500/50 transition-colors group">
              <div className="text-xs text-emerald-400 font-bold mb-3">[MOD_02: AST_GUARD]</div>
              <h3 className="text-lg font-bold text-white mb-3 font-sans">AST Syntax Verification Loop</h3>
              <p className="text-slate-400 text-xs leading-relaxed font-sans">
                Queries are compiled through an Abstract Syntax Tree (AST) validator before touching the production database. Syntax errors or hallucinated columns trigger an automatic self-correcting retry loop.
              </p>
            </div>

            <div className="terminal-panel p-6 border-slate-800 hover:border-brand-500/50 transition-colors group">
              <div className="text-xs text-violet-400 font-bold mb-3">[MOD_03: SUBPROCESS_SANDBOX]</div>
              <h3 className="text-lg font-bold text-white mb-3 font-sans">Process-Isolated Python Execution</h3>
              <p className="text-slate-400 text-xs leading-relaxed font-sans">
                Data transformations and Plotly visual chart generation execute inside an isolated Python subprocess with strict CPU, memory, and timeout limits to prevent resource starvation or DoS attacks.
              </p>
            </div>
          </div>
        </section>

        {/* ── CTA Banner ──────────────────────────────────────────────────────── */}
        <section id="sandbox" className="py-16 px-6 max-w-5xl mx-auto mb-20 font-mono">
          <div className="terminal-panel p-10 md:p-14 text-center border-brand-500/40 relative">
            <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-brand-500" />
            <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-brand-500" />
            <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-brand-500" />
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-brand-500" />

            <span className="text-xs text-emerald-400 font-bold block mb-2">[READY_FOR_DEPLOYMENT]</span>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight font-sans">
              Initialize your autonomous SQL console.
            </h3>
            <p className="text-slate-400 max-w-lg mx-auto mb-8 text-xs leading-relaxed font-sans">
              Experience zero-hallucination data querying with interactive high-speed TanStack tables and Plotly analytics.
            </p>
            <button
              onClick={() => navigate(user ? '/chat' : '/signup')}
              className="btn-primary py-4 px-8 text-xs font-bold uppercase tracking-widest shadow-xl shadow-brand-500/20 scale-105 hover:scale-110 transition-transform"
            >
              [INITIALIZE_AGENT_WORKSPACE →]
            </button>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 py-10 px-6 text-center font-mono text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400 font-bold">
            <span>CHINOOK // DATA COCKPIT v2.0</span>
          </div>
          <div>
            Powered by Google DeepMind Agent Architecture // AST Guard // Subprocess Sandbox
          </div>
        </div>
      </footer>
    </div>
  )
}
