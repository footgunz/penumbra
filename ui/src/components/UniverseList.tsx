import type { StatusMessage, UniverseStatus } from '../types'

interface Props {
  status: StatusMessage | null
}

export function UniverseList({ status }: Props) {
  const universes = status?.universes ?? {}
  const entries = Object.entries(universes) as [string, UniverseStatus][]

  if (entries.length === 0) {
    return <div style={styles.empty}>No universes configured.</div>
  }

  return (
    <div style={styles.list}>
      {entries.map(([id, u]) => (
        <div key={id} style={styles.row}>
          <span style={styles.label}>Universe {id}: {u.label}</span>
          <span style={styles.ip}>{u.ip}</span>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    fontFamily: 'monospace',
    fontSize: 13,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: '#ccc',
  },
  ip: {
    color: '#666',
    marginLeft: 'auto',
  },
  empty: {
    padding: '16px',
    color: '#666',
    fontFamily: 'monospace',
    fontSize: 13,
  },
}
