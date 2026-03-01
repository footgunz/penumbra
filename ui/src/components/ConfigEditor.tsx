import { useCallback, useEffect, useState } from 'react'
import CodeMirror, { oneDark } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { Button } from '@/components/ui/button'

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
    <>
      {/* Mobile: show message instead of editor */}
      <div className="md:hidden flex items-center justify-center flex-1 p-8 text-text-muted text-sm text-center">
        Config editor is available on desktop (768px+).
      </div>

      {/* Desktop: full editor */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background">
          <span className="text-xs font-semibold tracking-widest uppercase text-text-dim">
            Expert config editor
          </span>
          <Button
            size="sm"
            disabled={saveState === 'saving'}
            onClick={handleSave}
          >
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <CodeMirror
            value={value}
            onChange={setValue}
            extensions={[json()]}
            theme={oneDark}
            style={{ height: '100%', fontSize: 13 }}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        </div>
        {errorMsg && (
          <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-error-border bg-error-bg text-error-text text-xs px-4 py-2">
            {errorMsg}
          </div>
        )}
      </div>
    </>
  )
}
