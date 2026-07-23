What this product actually is

An agent that turns natural-language questions into validated, read-only SQL, executes them, and returns tables/charts/explanations — with a human-approval step before execution. Built on LangGraph + Groq. This brief exists because the current UI misrepresents this in two ways: (1) it invents technology the product doesn't use, and (2) it displays numbers as if they're live telemetry when they're static decoration. Both must be fixed, not just restyled.

Non-negotiable content fixes (fix these regardless of visual direction)
Remove any claim of technology the product doesn't use. No "Powered by Google DeepMind" or similar attribution. State the real stack only: LangGraph, Groq, PostgreSQL, sqlglot.
Every number shown as a live stat must come from a real check, or be removed. If there's a LATENCY: 189ms or STATUS: VERIFIED_OK indicator, it must be the result of an actual health-check/API call rendered live — not a hardcoded string. If wiring it live isn't feasible right now, remove the number and keep only a genuine binary state ("Connected" / "Not connected"), sourced from a real request.
One primary call-to-action, not three. Collapse "Initialize Cockpit" / "Initialize Agent" / "Initialize Agent Workspace" into a single consistent action, worded the same way everywhere it appears.
Keep what's real. The dynamic data-source list (e.g. "Neon DB", "Neon DB 2"), the session/query history log, and the quick-start macro cards are genuine functionality — carry these into the new design as-is, just restyled.
Design direction: modern and immersive, not terminal-cosplay

Move away from the black/near-black, all-caps, bracket-notation, corner-crosshair "hacker console" aesthetic entirely. Target the feeling of a well-funded, credible AI product — think Linear, Vercel, Perplexity, or Notion AI's marketing pages: confident typography, generous whitespace, restrained color, a small amount of real motion (subtle fade/slide-in on scroll), and no simulated "system readout" language anywhere in user-facing copy.

Color
Background: off-white or very soft neutral (
#FAFAF9) for marketing pages; a deep neutral (
#111214, not pure black) for the console/app view, if a dark app view is wanted
One accent color, used sparingly (a single saturated blue, violet, or emerald — not orange-as-warning-sign) — reserve it for the primary CTA and active states only
Everything else: a tight neutral grayscale ramp, no more than 4–5 steps
Typography
A confident sans-serif for headings (Inter, General Sans, or similar) at a real editorial scale — hero headline large and human, not monospace
Monospace reserved strictly for actual code/SQL/logs — never for buttons, nav, or marketing headlines
Body copy in plain sentences, no ALL_CAPS_WITH_UNDERSCORES anywhere outside of an actual code block
Layout & motion
Real whitespace between sections — let the product breathe instead of filling every pixel with a bordered panel
Subtle scroll-triggered fade/slide for section reveals (nothing gimmicky, no glitch/scan-line effects)
Cards and panels: soft 1px borders or a gentle shadow, rounded corners (8–12px), no crosshair/bracket corner decorations
Real screenshots or a live embedded demo of the actual product in the hero section, instead of an illustrated "diagnostic terminal" mockup
Copy voice
Plain, confident, human: "Ask your database a question in plain English" instead of "Turn natural queries into precision SQL diagnostics"
Feature descriptions state what the system actually does and why it matters, without inventing superlatives ("zero-hallucination," "absolute accuracy") that can't be substantiated
Any security/safety claim should describe the real mechanism plainly: "Every query is checked against a syntax validator and run in read-only mode" rather than "AST_STATUS: VERIFIED_OK"
Screens to design
Landing page — headline, one clear description of what it does, a real product screenshot or embedded live demo, one primary CTA, a short 3-feature section (schema pruning, safety validation, human approval) described in plain language
Sign in / sign up — plain, standard auth forms, no themed copy
Console — sidebar with real data-source list and query history (keep as-is functionally), main panel with chat thread, SQL panel, results table, chart — restyled to the new neutral/whitespace system, still allowed to use monospace for the actual SQL and code panels
Settings — profile and connection management
What to explicitly avoid
Bracket-notation UI labels ([EXECUTE], [INITIALIZE_AGENT]) outside of genuine technical/system content
Invented or unverifiable "live" metrics anywhere
Attribution to any technology, lab, or company not actually used in the stack
Multiple differently-worded buttons that perform the same action
Corner-crosshair / scan-line / glitch decorative motifs