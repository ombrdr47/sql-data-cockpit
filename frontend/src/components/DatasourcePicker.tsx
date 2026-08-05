/**
 * components/DatasourcePicker.tsx
 * Styled datasource selector — replaces raw inline styles with Tailwind.
 * All logic (selectedId, onChange, status dot) preserved verbatim.
 */
import type { UserConnection } from '../lib/api'

interface Props {
  connections: UserConnection[]
  selectedId: string | null   // null = Chinook demo
  onChange: (id: string | null) => void
}

const STATUS_DOT: Record<string, string> = {
  connected:   '#4ade80',
  unreachable: '#f87171',
  auth_failed: '#f87171',
  untested:    '#fbbf24',
}

export default function DatasourcePicker({ connections, selectedId, onChange }: Props) {
  const selectedConn = connections.find((c) => c.id === selectedId)
  const dotColor = selectedId && selectedConn ? STATUS_DOT[selectedConn.status] ?? '#94a3b8' : null

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl
                    bg-white/[0.04] border border-white/[0.08]
                    hover:border-white/[0.14] transition-colors duration-150">
      {/* Label */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.8" className="text-slate-500 flex-shrink-0">
        <ellipse cx="12" cy="5" rx="9" ry="3"/>
        <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12"/>
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
      </svg>

      <span className="text-xs text-slate-500 font-medium whitespace-nowrap flex-shrink-0">
        Data source
      </span>

      {/* Native select — styled transparently */}
      <select
        id="datasource-picker"
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="flex-1 min-w-0 bg-transparent border-none outline-none
                   text-slate-200 text-xs font-medium cursor-pointer
                   appearance-none truncate"
        style={{ colorScheme: 'dark' }}
      >
        <option value="">🎵 Chinook Demo</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            🔗 {c.name}
          </option>
        ))}
      </select>

      {/* Chevron */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2.5" className="text-slate-600 flex-shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>

      {/* Status dot for selected BYODB connection */}
      {dotColor && (
        <span
          title={selectedConn?.status}
          className="flex-shrink-0 w-2 h-2 rounded-full"
          style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}88` }}
        />
      )}
    </div>
  )
}
