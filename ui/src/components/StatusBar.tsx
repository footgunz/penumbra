import type { StatusMessage } from '../types'

interface Props {
  status: StatusMessage | null
}

export function StatusBar({ status }: Props) {
  const connected = status?.m4l_connected ?? false
  const lastSeen = status?.m4l_last_seen
  const universeCount = status ? Object.keys(status.universes).length : 0

  const lastSeenStr = lastSeen
    ? new Date(lastSeen).toLocaleTimeString()
    : '—'

  return (
    <div style={styles.bar}>
      <span style={{ ...styles.badge, background: connected ? '#22c55e' : '#ef4444' }}>
        {connected ? 'M4L Connected' : 'M4L Disconnected'}
      </span>
      <span style={styles.meta}>Last seen: {lastSeenStr}</span>
      <span style={styles.meta}>{universeCount} universe{universeCount !== 1 ? 's' : ''}</span>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '8px 16px',
    background: '#1a1a2e',
    borderBottom: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  badge: {
    padding: '2px 10px',
    borderRadius: 4,
    color: '#fff',
    fontWeight: 600,
  },
  meta: {
    color: '#aaa',
  },
}
