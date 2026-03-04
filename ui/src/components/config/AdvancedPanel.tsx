import { useCallback, useState } from 'react'
import CodeMirror, { oneDark } from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { Button } from '@/components/ui/button'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface AdvancedPanelProps {
  configJson: string
  onSave: (json: string) => Promise<void>
}

export function AdvancedPanel({ configJson, onSave }: AdvancedPanelProps) {
  const [value, setValue] = useState(configJson)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    setErrorMsg(null)
    try {
      JSON.parse(value)
    } catch (e) {
      setErrorMsg('Invalid JSON: ' + (e instanceof Error ? e.message : String(e)))
      return
    }

    setSaveState('saving')
    try {
      await onSave(value)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (e) {
      setSaveState('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }, [value, onSave])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
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
        <div className="border-t border-error-border bg-error-bg text-error-text text-xs px-4 py-2">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
