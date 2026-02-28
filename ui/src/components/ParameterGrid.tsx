interface Props {
  params: Record<string, number>
}

export function ParameterGrid({ params }: Props) {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) {
    return <div style={styles.empty}>No parameters received yet.</div>
  }

  return (
    <div style={styles.grid}>
      {entries.map(([name, value]) => (
        <div key={name} style={styles.row}>
          <span style={styles.name}>{name}</span>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${Math.round(value * 100)}%` }} />
          </div>
          <span style={styles.value}>{(value * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  grid: {
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '200px 1fr 60px',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: '#ccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  barTrack: {
    height: 8,
    background: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: '#6366f1',
    borderRadius: 4,
    transition: 'width 80ms linear',
  },
  value: {
    color: '#aaa',
    textAlign: 'right',
  },
  empty: {
    padding: 24,
    color: '#666',
    fontFamily: 'monospace',
    fontSize: 13,
  },
}
