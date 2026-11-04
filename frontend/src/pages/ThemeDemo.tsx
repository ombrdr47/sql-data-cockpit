import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductPreview } from './Landing'
import '../theme-demo.css'

export default function ThemeDemo() {
  const [graphite, setGraphite] = useState(true)
  return <main className={`chat-theme-demo ${graphite ? 'is-graphite' : 'is-blue'}`}>
    <header className="chat-theme-controls">
      <div><span>CHAT INTERFACE PREVIEW</span><h1>{graphite ? 'Neutral graphite' : 'Blue comparison'}</h1></div>
      <div className="chat-theme-picker" role="group" aria-label="Chat palette"><button aria-pressed={graphite} onClick={() => setGraphite(true)}>Graphite</button><button aria-pressed={!graphite} onClick={() => setGraphite(false)}>Blue</button></div>
      <Link to="/chat">Back to workspace ↗</Link>
    </header>
    <section className="chat-theme-stage" aria-label="Interactive sample chat"><ProductPreview /></section>
    <footer className="chat-theme-note"><span>Try Results, Chart, SQL, and Save. Sample content only; no queries are run.</span><span>Homepage and live workspace unchanged.</span></footer>
  </main>
}
