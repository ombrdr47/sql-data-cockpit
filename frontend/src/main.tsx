import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ── Global Error Boundary ─────────────────────────────────────────────────────
// Prevents any uncaught React render error from showing a blank white screen.
// Shows a recoverable error card with a reload button instead.
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0a0a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'JetBrains Mono, monospace',
          padding: '24px',
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            background: '#0f172a',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 0 40px rgba(248,113,113,0.08)',
          }}>
            <div style={{ color: '#f87171', fontSize: '0.75rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              // RUNTIME_ERROR
            </div>
            <h2 style={{ margin: '0 0 12px', color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 600 }}>
              Something went wrong
            </h2>
            <pre style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.75rem',
              color: '#f87171',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: '20px',
            }}>
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
              }}
            >
              ↺ Reload Application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
