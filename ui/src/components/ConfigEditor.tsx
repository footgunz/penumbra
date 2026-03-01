import { useCallback, useEffect, useState } from 'react'
import CodeMirror, { oneDark } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ConfigEditor() {
  const [value, setValue] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`)
        return r.text()
      })
      .then(setValue)
      .catch((e: Error) => {
        setErrorMsg(e.message)
      })
  }, [])

  const handleSave = useCallback(async () => {
    setErrorMsg(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch (e) {
      setErrorMsg('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
      return
    }

    setSaveState('saving')
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!r.ok) {
        const text = await r.text()
        throw new Error(text.trim() || `HTTP ${r.status}`)
      }
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (e) {
      setSaveState('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }, [value])

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <span style={styles.title}>Expert config editor</span>
        <button
          style={saveState === 'saving' ? styles.btnDisabled : styles.btn}
          onClick={handleSave}
          disabled={saveState === 'saving'}
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
        </button>
      </div>
      <div style={styles.editor}>
        <CodeMirror
          value={value}
          onChange={setValue}
          extensions={[json()]}
          theme={oneDark}
          style={{ height: '100%', fontSize: 13 }}
          basicSetup={{ lineNumbers: true, foldGutter: true }}
        />
      </div>
      {errorMsg && <div style={styles.error}>{errorMsg}</div>}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #222',
    background: '#0f0f1a',
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#888',
  },
  btn: {
    background: '#6366f1',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 14px',
  },
  btnDisabled: {
    background: '#3b3d6e',
    border: 'none',
    borderRadius: 4,
    color: '#999',
    cursor: 'not-allowed',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 14px',
  },
  editor: {
    flex: 1,
    overflow: 'auto',
  },
  error: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#3d1515',
    borderTop: '1px solid #6b1f1f',
    color: '#f87171',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '8px 16px',
    zIndex: 100,
  },
}
