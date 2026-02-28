import { useEffect, useState } from 'react'
import type { ServerMessage, StatusMessage } from './types'
import { client } from './ws/client'
import { StatusBar } from './components/StatusBar'
import { ParameterGrid } from './components/ParameterGrid'
import { UniverseList } from './components/UniverseList'

export function App() {
  const [params, setParams] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<StatusMessage | null>(null)

  useEffect(() => {
    const wsUrl =
      window.location.protocol === 'https:'
        ? `wss://${window.location.host}/ws`
        : `ws://${window.location.host}/ws`
    client.connect(wsUrl)

    const unsub = client.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'state':
          setParams(msg.state)
          break
        case 'diff':
          setParams((prev) => ({ ...prev, ...msg.changes }))
          break
        case 'session':
          // New session — clear params until next state arrives
          setParams({})
          break
        case 'status':
          setStatus(msg)
          break
      }
    })

    return unsub
  }, [])

  return (
    <div style={styles.root}>
      <StatusBar status={status} />
      <div style={styles.body}>
        <section style={styles.section}>
          <h2 style={styles.heading}>Parameters</h2>
          <ParameterGrid params={params} />
        </section>
        <section style={styles.section}>
          <h2 style={styles.heading}>Universes</h2>
          <UniverseList status={status} />
        </section>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0f0f1a',
    color: '#eee',
    display: 'flex',
    flexDirection: 'column',
  },
  body: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    overflow: 'hidden',
  },
  section: {
    flex: 1,
    overflowY: 'auto',
    borderRight: '1px solid #222',
  },
  heading: {
    margin: 0,
    padding: '12px 16px',
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: '#888',
    borderBottom: '1px solid #222',
    letterSpacing: 1,
  },
}
