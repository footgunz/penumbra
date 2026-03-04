# Config Sub-Tab Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Configure tab into sub-tabs (Universes | Mapping | Zones | Advanced) with shared config state fetched once at the parent level.

**Architecture:** Refactor `ConfigEditor` from a monolithic CodeMirror JSON editor into a container component that fetches config, holds typed state, and renders a sub-tab bar. Each sub-tab is a separate component. The existing JSON editor moves to the "Advanced" sub-tab. Stub panels accept typed props for future structured editors.

**Tech Stack:** React, shadcn/ui Tabs (already installed), existing protocol-types

---

### Task 1: Create feature branch

**Step 1: Create and switch to feature branch**

Run: `git checkout -b feat/issue-31-config-sub-tabs`

**Step 2: Commit design doc**

Run:
```bash
git add docs/plans/2026-03-03-config-sub-tabs-design.md docs/plans/2026-03-03-config-sub-tabs.md
git commit -m "docs: add design and implementation plan for config sub-tabs (#31)"
```

---

### Task 2: Add config types to UI

**Files:**
- Modify: `ui/src/types/index.ts`

The UI needs a typed representation of the full config object returned by `GET /api/config`. The server returns `{ universes: Record<number, UniverseConfig>, parameters: Record<string, ParameterConfig> }`. Reuse existing types from protocol-types.

**Step 1: Add AppConfig type**

In `ui/src/types/index.ts`, add after the existing re-exports:

```ts
import type { UniverseConfig, ParameterConfig } from '@penumbra/protocol-types'

/** Full config object matching GET /api/config response */
export interface AppConfig {
  universes: Record<string, UniverseConfig>
  parameters: Record<string, ParameterConfig>
}
```

Note: JSON keys are always strings, so `Record<string, UniverseConfig>` even though universe IDs are numbers conceptually.

**Step 2: Verify typecheck passes**

Run: `pnpm --filter ui typecheck`
Expected: success, no errors

**Step 3: Commit**

```bash
git add ui/src/types/index.ts
git commit -m "feat(ui): add AppConfig type for config sub-tabs (#31)"
```

---

### Task 3: Extract AdvancedPanel from ConfigEditor

**Files:**
- Create: `ui/src/components/config/AdvancedPanel.tsx`

Extract the existing CodeMirror JSON editor into its own component. It receives the full config as a JSON string and an `onSave` callback.

**Step 1: Create AdvancedPanel**

Create `ui/src/components/config/AdvancedPanel.tsx`:

```tsx
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

  // Sync when parent config changes (e.g. after another tab saves)
  // Only update if the user hasn't made local edits
  // (We track this by comparing against the last-known parent value)

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
```

**Step 2: Verify typecheck**

Run: `pnpm --filter ui typecheck`
Expected: success

**Step 3: Commit**

```bash
git add ui/src/components/config/AdvancedPanel.tsx
git commit -m "feat(ui): extract AdvancedPanel from ConfigEditor (#31)"
```

---

### Task 4: Create stub sub-tab panels

**Files:**
- Create: `ui/src/components/config/UniversesPanel.tsx`
- Create: `ui/src/components/config/MappingPanel.tsx`
- Create: `ui/src/components/config/ZonesPanel.tsx`

Each stub receives its config slice and an onChange callback. Renders a placeholder.

**Step 1: Create UniversesPanel**

Create `ui/src/components/config/UniversesPanel.tsx`:

```tsx
import type { UniverseConfig } from '@penumbra/protocol-types'

interface UniversesPanelProps {
  universes: Record<string, UniverseConfig>
  onChange: (universes: Record<string, UniverseConfig>) => void
}

export function UniversesPanel({ universes }: UniversesPanelProps) {
  const count = Object.keys(universes).length
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      Universe editor — {count} universe{count !== 1 ? 's' : ''} configured
    </div>
  )
}
```

**Step 2: Create MappingPanel**

Create `ui/src/components/config/MappingPanel.tsx`:

```tsx
import type { ParameterConfig } from '@penumbra/protocol-types'

interface MappingPanelProps {
  parameters: Record<string, ParameterConfig>
  onChange: (parameters: Record<string, ParameterConfig>) => void
}

export function MappingPanel({ parameters }: MappingPanelProps) {
  const count = Object.keys(parameters).length
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      Parameter mapping — {count} parameter{count !== 1 ? 's' : ''} mapped
    </div>
  )
}
```

**Step 3: Create ZonesPanel**

Create `ui/src/components/config/ZonesPanel.tsx`:

```tsx
export function ZonesPanel() {
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      Zones editor — coming soon
    </div>
  )
}
```

**Step 4: Verify typecheck**

Run: `pnpm --filter ui typecheck`
Expected: success

**Step 5: Commit**

```bash
git add ui/src/components/config/UniversesPanel.tsx ui/src/components/config/MappingPanel.tsx ui/src/components/config/ZonesPanel.tsx
git commit -m "feat(ui): add stub sub-tab panels for Universes, Mapping, Zones (#31)"
```

---

### Task 5: Refactor ConfigEditor as sub-tab container

**Files:**
- Modify: `ui/src/components/ConfigEditor.tsx`

This is the main change. ConfigEditor becomes a container that:
1. Fetches config on mount as typed state
2. Renders a sub-tab bar (Universes | Mapping | Zones | Advanced)
3. Routes to the appropriate panel component

**Step 1: Rewrite ConfigEditor**

Replace `ui/src/components/ConfigEditor.tsx` with:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { AppConfig } from '@/types'
import { UniversesPanel } from './config/UniversesPanel'
import { MappingPanel } from './config/MappingPanel'
import { ZonesPanel } from './config/ZonesPanel'
import { AdvancedPanel } from './config/AdvancedPanel'

type ConfigTab = 'universes' | 'mapping' | 'zones' | 'advanced'

export function ConfigEditor() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`)
        return r.json()
      })
      .then((data: AppConfig) => setConfig(data))
      .catch((e: Error) => setError(e.message))
  }, [])

  const saveConfig = useCallback(async (updated: AppConfig) => {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (!r.ok) {
      const text = await r.text()
      throw new Error(text.trim() || `HTTP ${r.status}`)
    }
    setConfig(updated)
  }, [])

  const handleAdvancedSave = useCallback(async (jsonStr: string) => {
    const parsed = JSON.parse(jsonStr) as AppConfig
    await saveConfig(parsed)
  }, [saveConfig])

  if (error) {
    return (
      <div className="flex items-center justify-center flex-1 text-error-text text-sm">
        Failed to load config: {error}
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
        Loading config…
      </div>
    )
  }

  return (
    <>
      {/* Mobile: show message */}
      <div className="md:hidden flex items-center justify-center flex-1 p-8 text-text-muted text-sm text-center">
        Config editor is available on desktop (768px+).
      </div>

      {/* Desktop: sub-tabbed editor */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        <Tabs defaultValue="universes" className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-surface px-2 h-10">
            <TabsTrigger value="universes" className="text-xs font-semibold tracking-wider uppercase">
              Universes
            </TabsTrigger>
            <TabsTrigger value="mapping" className="text-xs font-semibold tracking-wider uppercase">
              Mapping
            </TabsTrigger>
            <TabsTrigger value="zones" className="text-xs font-semibold tracking-wider uppercase">
              Zones
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs font-semibold tracking-wider uppercase">
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="universes" className="flex-1 overflow-hidden data-[state=active]:flex">
            <UniversesPanel
              universes={config.universes}
              onChange={(universes) => {
                const updated = { ...config, universes }
                setConfig(updated)
                saveConfig(updated)
              }}
            />
          </TabsContent>

          <TabsContent value="mapping" className="flex-1 overflow-hidden data-[state=active]:flex">
            <MappingPanel
              parameters={config.parameters}
              onChange={(parameters) => {
                const updated = { ...config, parameters }
                setConfig(updated)
                saveConfig(updated)
              }}
            />
          </TabsContent>

          <TabsContent value="zones" className="flex-1 overflow-hidden data-[state=active]:flex">
            <ZonesPanel />
          </TabsContent>

          <TabsContent value="advanced" className="flex-1 overflow-hidden data-[state=active]:flex">
            <AdvancedPanel
              configJson={JSON.stringify(config, null, 2)}
              onSave={handleAdvancedSave}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
```

**Step 2: Verify typecheck**

Run: `pnpm --filter ui typecheck`
Expected: success

**Step 3: Verify build**

Run: `pnpm --filter ui build`
Expected: success

**Step 4: Commit**

```bash
git add ui/src/components/ConfigEditor.tsx
git commit -m "feat(ui): refactor ConfigEditor with sub-tab navigation (#31)"
```

---

### Task 6: Visual verification and cleanup

**Step 1: Start dev servers**

Run in separate terminals:
```bash
# Terminal 1: Go server
cd server && go run .

# Terminal 2: Vite dev server
cd ui && pnpm dev

# Terminal 3: Fake emitter
cd tools/fake-emitter && go run . -mode animated
```

**Step 2: Verify in browser**

Open `http://localhost:5173`. Check:
- [ ] Configure tab shows sub-tab bar: Universes | Mapping | Zones | Advanced
- [ ] Universes tab shows stub with universe count
- [ ] Mapping tab shows stub with parameter count
- [ ] Zones tab shows "coming soon" stub
- [ ] Advanced tab shows the CodeMirror JSON editor with config
- [ ] Saving in Advanced tab works (edit JSON, click Save)
- [ ] Mobile view still shows "desktop only" message

**Step 3: Run full checks**

```bash
pnpm --filter ui typecheck && pnpm --filter ui build
```

**Step 4: Final commit if any cleanup needed, then push**

```bash
git push -u origin feat/issue-31-config-sub-tabs
```
