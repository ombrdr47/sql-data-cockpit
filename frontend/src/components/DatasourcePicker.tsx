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
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.10)',
      fontSize: '0.84rem',
    }}>
      <span style={{ color: 'var(--text-secondary, #aaa)', whiteSpace: 'nowrap' }}>
        Data source:
      </span>
      <select
        id="datasource-picker"
        value={selectedId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text-primary, #e0e0e0)',
          fontSize: '0.84rem',
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
        }}
      >
        <option value="">🎵 Chinook Demo</option>
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            🔗 {c.name}
          </option>
        ))}
      </select>

      {/* Status dot for the selected BYODB connection */}
      {selectedId && (() => {
        const conn = connections.find((c) => c.id === selectedId)
        if (!conn) return null
        const color = STATUS_DOT[conn.status] ?? '#aaa'
        return (
          <span title={conn.status} style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: `0 0 6px ${color}88`,
          }} />
        )
      })()}
    </div>
  )
}
