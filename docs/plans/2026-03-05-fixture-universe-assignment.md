# Fixture-to-Universe Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to assign fixtures (from library or manual) to universe channel ranges, with auto-placement at the first free address, a channel strip visualization, and overlap prevention.

**Architecture:** Add a `Patch` struct to Go config with server-side overlap validation. On the UI side, build a `PatchPanel` (shown when clicking into a universe), a `FixturePicker` modal, and a `ChannelStrip` visualization. The `UniversesPanel` gains a "select universe to patch" interaction.

**Tech Stack:** Go (config structs, validation), React/TypeScript (PatchPanel, FixturePicker, ChannelStrip), Tailwind/shadcn, LinguiJS i18n macros.

---

### Task 1: Add Patch struct and update UniverseConfig in Go

**Files:**
- Modify: `server/config/config.go`

**Step 1: Add the Patch struct and update UniverseConfig**

Replace the `Channels` field on `UniverseConfig` with `Patches`:

```go
// Patch represents a fixture assigned to a contiguous range of DMX channels
// within a universe. Library fixtures reference a key in the fixture store;
// manual fixtures carry their own channel names.
type Patch struct {
	FixtureKey   string   `json:"fixtureKey"`
	Label        string   `json:"label"`
	StartAddress int      `json:"startAddress"`
	Channels     []string `json:"channels,omitempty"` // only for fixtureKey == "manual"
}

type UniverseConfig struct {
	DeviceIP string  `json:"device_ip"`
	Type     string  `json:"type"`
	Label    string  `json:"label"`
	Patches  []Patch `json:"patches,omitempty"`
}
```

Remove the `Channels map[string]string` field entirely.

**Step 2: Run Go vet**

Run: `cd server && go vet ./...`
Expected: PASS (no references to the removed Channels field in server code)

**Step 3: Commit**

```bash
git add server/config/config.go
git commit -m "feat(config): add Patch struct, replace Channels with Patches on UniverseConfig"
```

---

### Task 2: Add server-side patch overlap validation

**Files:**
- Modify: `server/config/config.go`
- Create: `server/config/config_test.go`

**Step 1: Write the failing test**

Create `server/config/config_test.go`:

```go
package config

import "testing"

func TestValidatePatches_NoOverlap(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "generic/rgbw-4ch", StartAddress: 1, Label: "A"},
		{FixtureKey: "generic/rgb-3ch", StartAddress: 5, Label: "B"},
	}
	// Channel counts: A occupies 1-4, B occupies 5-7 — no overlap
	channelCounts := map[string]int{"generic/rgbw-4ch": 4, "generic/rgb-3ch": 3}
	resolver := func(key string) int { return channelCounts[key] }
	if err := ValidatePatches(patches, resolver); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestValidatePatches_Overlap(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "generic/rgbw-4ch", StartAddress: 1, Label: "A"},
		{FixtureKey: "generic/rgb-3ch", StartAddress: 3, Label: "B"},
	}
	// A occupies 1-4, B starts at 3 — overlap at channels 3-4
	channelCounts := map[string]int{"generic/rgbw-4ch": 4, "generic/rgb-3ch": 3}
	resolver := func(key string) int { return channelCounts[key] }
	err := ValidatePatches(patches, resolver)
	if err == nil {
		t.Fatal("expected overlap error, got nil")
	}
}

func TestValidatePatches_ManualFixture(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "manual", StartAddress: 1, Label: "Custom", Channels: []string{"Ch1", "Ch2", "Ch3"}},
		{FixtureKey: "generic/rgb-3ch", StartAddress: 4, Label: "Par"},
	}
	channelCounts := map[string]int{"generic/rgb-3ch": 3}
	resolver := func(key string) int { return channelCounts[key] }
	if err := ValidatePatches(patches, resolver); err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestValidatePatches_ExceedsDMXRange(t *testing.T) {
	patches := []Patch{
		{FixtureKey: "manual", StartAddress: 511, Label: "Too far", Channels: []string{"A", "B", "C"}},
	}
	resolver := func(key string) int { return 0 }
	err := ValidatePatches(patches, resolver)
	if err == nil {
		t.Fatal("expected out-of-range error, got nil")
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd server && go test ./config/ -v`
Expected: FAIL — `ValidatePatches` undefined

**Step 3: Implement ValidatePatches**

Add to `server/config/config.go`:

```go
import "fmt"

// ChannelCountResolver returns the channel count for a fixture key.
// Used by ValidatePatches to determine how many channels a library fixture occupies.
type ChannelCountResolver func(key string) int

// ValidatePatches checks that no two patches in a universe overlap
// and that all patches fit within the 512-channel DMX range.
func ValidatePatches(patches []Patch, resolve ChannelCountResolver) error {
	occupied := make(map[int]string) // channel -> patch label
	for _, p := range patches {
		count := len(p.Channels)
		if p.FixtureKey != "manual" {
			count = resolve(p.FixtureKey)
		}
		if count == 0 {
			return fmt.Errorf("fixture %q has 0 channels", p.Label)
		}
		end := p.StartAddress + count - 1
		if p.StartAddress < 1 || end > 512 {
			return fmt.Errorf("fixture %q (address %d-%d) exceeds DMX range 1-512", p.Label, p.StartAddress, end)
		}
		for ch := p.StartAddress; ch <= end; ch++ {
			if owner, exists := occupied[ch]; exists {
				return fmt.Errorf("channel %d: conflict between %q and %q", ch, owner, p.Label)
			}
			occupied[ch] = p.Label
		}
	}
	return nil
}
```

**Step 4: Run tests to verify they pass**

Run: `cd server && go test ./config/ -v`
Expected: PASS — all 4 tests pass

**Step 5: Commit**

```bash
git add server/config/config.go server/config/config_test.go
git commit -m "feat(config): add ValidatePatches with overlap and range checks"
```

---

### Task 3: Wire validation into POST /api/config

**Files:**
- Modify: `server/api/routes.go`

**Step 1: Update the config POST handler to validate patches**

In `routes.go`, after `cfg.Universes = update.Universes` (around line 119), add validation before saving:

```go
// Validate patches in each universe
for uid, u := range cfg.Universes {
    if len(u.Patches) > 0 {
        resolver := func(key string) int {
            f, ok := fixtureStore.Get(key)
            if !ok {
                return 0
            }
            return f.ChannelCount
        }
        if err := config.ValidatePatches(u.Patches, resolver); err != nil {
            http.Error(w, fmt.Sprintf("universe %d: %v", uid, err), http.StatusBadRequest)
            return
        }
    }
}
```

Also add `"fmt"` to the imports if not already present.

**Step 2: Run Go vet**

Run: `cd server && go vet ./...`
Expected: PASS

**Step 3: Commit**

```bash
git add server/api/routes.go
git commit -m "feat(api): validate patch overlaps on config save"
```

---

### Task 4: Update config.json to use patches format

**Files:**
- Modify: `server/config.json`

**Step 1: Convert existing universe entries to use patches**

Update `server/config.json`. The existing `channels` field (if any) should be removed. Add example patches:

```json
{
  "emitter": {
    "idle_timeout_s": 5,
    "disconnect_timeout_s": 3600
  },
  "blackout_scene": {},
  "universes": {
    "1": {
      "device_ip": "192.168.1.101",
      "type": "wled",
      "label": "stage left",
      "patches": [
        {"fixtureKey": "generic/rgbaw-6ch", "label": "Front Par", "startAddress": 1}
      ]
    },
    "2": {
      "device_ip": "192.168.1.102",
      "type": "wled",
      "label": "stage right",
      "patches": [
        {"fixtureKey": "generic/moving-head-8ch", "label": "Mover Back", "startAddress": 1}
      ]
    }
  },
  "parameters": {
    "par_front_Dimmer": [{ "universe": 1, "channel": 1 }],
    "par_front_Red":    [{ "universe": 1, "channel": 2 }],
    "par_front_Green":  [{ "universe": 1, "channel": 3 }],
    "par_front_Blue":   [{ "universe": 1, "channel": 4 }],
    "par_front_Strobe": [{ "universe": 1, "channel": 5 }],
    "par_front_Mode":   [{ "universe": 1, "channel": 6 }],
    "mover_back_Pan":     [{ "universe": 2, "channel": 1 }],
    "mover_back_Tilt":    [{ "universe": 2, "channel": 2 }],
    "mover_back_Dimmer":  [{ "universe": 2, "channel": 3 }],
    "mover_back_Color":   [{ "universe": 2, "channel": 4 }],
    "mover_back_Gobo":    [{ "universe": 2, "channel": 5 }],
    "mover_back_Speed":   [{ "universe": 2, "channel": 6 }]
  }
}
```

**Step 2: Run Go server to verify config loads**

Run: `cd server && go build -o penumbra-server . && ./penumbra-server &; sleep 1; curl -s localhost:3000/api/config | head -30; kill %1`
Expected: JSON output shows patches on universes

**Step 3: Commit**

```bash
git add server/config.json
git commit -m "chore(config): migrate example config to patches format"
```

---

### Task 5: Update TypeScript types

**Files:**
- Modify: `packages/protocol-types/index.ts`
- Modify: `ui/src/types/index.ts`

**Step 1: Add Patch type and update UniverseConfig in protocol-types**

In `packages/protocol-types/index.ts`, add the `Patch` interface and update `UniverseConfig`:

```ts
export interface Patch {
  fixtureKey: string
  label: string
  startAddress: number
  channels?: string[]  // only for fixtureKey === "manual"
}

export interface UniverseConfig {
  device_ip: string
  type: 'wled' | 'gateway'
  label: string
  patches?: Patch[]
}
```

Remove the `channels?: Record<string, string>` field from `UniverseConfig`.

Add `Patch` to the exports.

**Step 2: Update ui/src/types/index.ts**

Add `Patch` to the imports and re-exports from `@penumbra/protocol-types`:

```ts
import type {
  UniverseConfig,
  ParameterConfig,
  Patch,
} from '@penumbra/protocol-types'

export type {
  // ... existing exports ...
  Patch,
} from '@penumbra/protocol-types'
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: Should surface any places using the old `channels` field — fix those in later tasks.

**Step 4: Commit**

```bash
git add packages/protocol-types/index.ts ui/src/types/index.ts
git commit -m "feat(types): add Patch type, update UniverseConfig to use patches"
```

---

### Task 6: Update UniversesPanel to support selecting a universe

**Files:**
- Modify: `ui/src/components/config/UniversesPanel.tsx`
- Modify: `ui/src/App.tsx`

The `UniversesPanel` currently shows a flat list. We need to add a "select a universe to view/edit its patches" interaction. When a universe is selected, the `PatchPanel` (Task 7) will render alongside or below.

**Step 1: Add selectedUniverse state and callback to UniversesPanel**

Add an `onSelectUniverse` prop and a visual "selected" state to universe rows. In the non-editing row view, make the row clickable:

In `UniversesPanel.tsx`, update the props interface:

```ts
interface UniversesPanelProps {
  universes: Record<string, UniverseConfig>
  status: StatusMessage | null
  onChange: (universes: Record<string, UniverseConfig>) => void
  onSave: (universes: Record<string, UniverseConfig>) => Promise<void>
  selectedUniverse: string | null
  onSelectUniverse: (id: string | null) => void
}
```

Update the destructured props:

```ts
export function UniversesPanel({ universes, status, onChange, onSave, selectedUniverse, onSelectUniverse }: UniversesPanelProps) {
```

On the non-editing universe row `<div>` (around line 243), add an `onClick` handler and a selected style:

```tsx
<div
  key={id}
  className={cn(
    "rounded border bg-surface p-3 flex items-center gap-3 cursor-pointer transition-colors",
    selectedUniverse === id
      ? "border-accent/60 bg-accent/5"
      : "border-border hover:border-border-muted"
  )}
  onClick={() => onSelectUniverse(selectedUniverse === id ? null : id)}
>
```

**Step 2: Update App.tsx to pass the new props and render PatchPanel**

Add `selectedUniverse` state in `App.tsx`:

```ts
const [selectedUniverse, setSelectedUniverse] = useState<string | null>(null)
```

Update the `universes` case in `renderContent()` to pass the new props and render PatchPanel alongside:

```tsx
case 'universes':
  return (
    <div className="flex flex-1 overflow-hidden">
      <UniversesPanel
        universes={config.universes}
        status={status}
        onChange={(universes) => setConfig({ ...config, universes })}
        onSave={(universes) => saveConfig({ ...config, universes })}
        selectedUniverse={selectedUniverse}
        onSelectUniverse={setSelectedUniverse}
      />
      {selectedUniverse && config.universes[selectedUniverse] && (
        <PatchPanel
          universeId={selectedUniverse}
          universe={config.universes[selectedUniverse]}
          onSave={(patches) => {
            const updated = {
              ...config,
              universes: {
                ...config.universes,
                [selectedUniverse]: { ...config.universes[selectedUniverse], patches },
              },
            }
            return saveConfig(updated)
          }}
        />
      )}
    </div>
  )
```

Add the import at top of `App.tsx`:

```ts
import { PatchPanel } from './components/config/PatchPanel'
```

This will not compile yet — `PatchPanel` doesn't exist. That's Task 7.

**Step 3: Commit**

```bash
git add ui/src/components/config/UniversesPanel.tsx ui/src/App.tsx
git commit -m "feat(ui): add universe selection for patch editing"
```

---

### Task 7: Create PatchPanel component

**Files:**
- Create: `ui/src/components/config/PatchPanel.tsx`

This is the main panel shown when a universe is selected. It displays assigned fixtures and provides "Add Fixture" and editing controls.

**Step 1: Create PatchPanel.tsx**

```tsx
import { useState } from 'react'
import { t } from '@lingui/core/macro'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Patch, UniverseConfig, Fixture } from '@/types'
import { FixturePicker } from './FixturePicker'
import { ChannelStrip } from './ChannelStrip'

interface PatchPanelProps {
  universeId: string
  universe: UniverseConfig
  onSave: (patches: Patch[]) => Promise<void>
}

function getChannelCount(patch: Patch, fixtures: Record<string, Fixture> | null): number {
  if (patch.fixtureKey === 'manual') return patch.channels?.length ?? 0
  return fixtures?.[patch.fixtureKey]?.channelCount ?? 0
}

function getChannelNames(patch: Patch, fixtures: Record<string, Fixture> | null): string[] {
  if (patch.fixtureKey === 'manual') return patch.channels ?? []
  return fixtures?.[patch.fixtureKey]?.channels ?? []
}

function nextFreeAddress(patches: Patch[], fixtures: Record<string, Fixture> | null): number {
  if (patches.length === 0) return 1
  const occupied = new Set<number>()
  for (const p of patches) {
    const count = getChannelCount(p, fixtures)
    for (let i = 0; i < count; i++) {
      occupied.add(p.startAddress + i)
    }
  }
  for (let addr = 1; addr <= 512; addr++) {
    if (!occupied.has(addr)) return addr
  }
  return 1
}

function hasOverlap(patches: Patch[], fixtures: Record<string, Fixture> | null): { channel: number; a: string; b: string } | null {
  const occupied = new Map<number, string>()
  for (const p of patches) {
    const count = getChannelCount(p, fixtures)
    for (let i = 0; i < count; i++) {
      const ch = p.startAddress + i
      const existing = occupied.get(ch)
      if (existing) return { channel: ch, a: existing, b: p.label }
      occupied.set(ch, p.label)
    }
  }
  return null
}

export function PatchPanel({ universeId, universe, onSave }: PatchPanelProps) {
  const patches = universe.patches ?? []
  const [fixtures, setFixtures] = useState<Record<string, Fixture> | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editChannels, setEditChannels] = useState<string[]>([])
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch fixtures on mount
  useState(() => {
    fetch('/api/fixtures')
      .then((r) => r.json() as Promise<Record<string, Fixture>>)
      .then(setFixtures)
      .catch(() => {})
  })

  async function addPatch(fixtureKey: string, channels?: string[]) {
    const label = fixtureKey === 'manual'
      ? t`Manual Fixture`
      : fixtures?.[fixtureKey]?.shortName ?? fixtureKey
    const newPatch: Patch = {
      fixtureKey,
      label,
      startAddress: nextFreeAddress(patches, fixtures),
      ...(channels ? { channels } : {}),
    }
    const updated = [...patches, newPatch]
    const overlap = hasOverlap(updated, fixtures)
    if (overlap) {
      setError(t`Channel ${overlap.channel}: conflict between "${overlap.a}" and "${overlap.b}"`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(updated)
      setShowPicker(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Save failed`)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(index: number) {
    const p = patches[index]
    setEditingIndex(index)
    setEditLabel(p.label)
    setEditAddress(String(p.startAddress))
    setEditChannels(p.fixtureKey === 'manual' ? [...(p.channels ?? [])] : [])
    setConfirmDeleteIndex(null)
    setError(null)
  }

  async function saveEdit() {
    if (editingIndex === null) return
    const addr = parseInt(editAddress, 10)
    if (isNaN(addr) || addr < 1 || addr > 512) {
      setError(t`Address must be between 1 and 512`)
      return
    }
    const p = patches[editingIndex]
    const updated = [...patches]
    updated[editingIndex] = {
      ...p,
      label: editLabel.trim() || p.label,
      startAddress: addr,
      ...(p.fixtureKey === 'manual' ? { channels: editChannels } : {}),
    }
    const overlap = hasOverlap(updated, fixtures)
    if (overlap) {
      setError(t`Channel ${overlap.channel}: conflict between "${overlap.a}" and "${overlap.b}"`)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(updated)
      setEditingIndex(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Save failed`)
    } finally {
      setSaving(false)
    }
  }

  async function deletePatch(index: number) {
    const updated = patches.filter((_, i) => i !== index)
    setSaving(true)
    setError(null)
    try {
      await onSave(updated)
      setConfirmDeleteIndex(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Delete failed`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-4 border-l border-border">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-muted">
          {t`Universe #${universeId} — ${universe.label || t`Untitled`}`}
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => { setShowPicker(true); setEditingIndex(null); setConfirmDeleteIndex(null); setError(null) }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t`Add Fixture`}
        </Button>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 text-xs rounded bg-error-bg border border-error-border text-error-text">
          {error}
        </div>
      )}

      {showPicker && (
        <FixturePicker
          fixtures={fixtures}
          onSelect={(key, channels) => { addPatch(key, channels) }}
          onCancel={() => setShowPicker(false)}
        />
      )}

      <div className="flex flex-col gap-2 mb-4">
        {patches.map((patch, index) => {
          const channelCount = getChannelCount(patch, fixtures)
          const channelNames = getChannelNames(patch, fixtures)
          const endAddress = patch.startAddress + channelCount - 1
          const isEditing = editingIndex === index
          const isConfirmingDelete = confirmDeleteIndex === index
          const displayName = patch.fixtureKey === 'manual'
            ? patch.label
            : fixtures?.[patch.fixtureKey]?.shortName ?? patch.fixtureKey

          if (isEditing) {
            return (
              <div key={index} className="rounded border border-accent/40 bg-surface p-3">
                <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-sm">
                  <label className="text-text-faint text-xs">{t`Label`}</label>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <label className="text-text-faint text-xs">{t`Address`}</label>
                  <Input
                    type="number"
                    min={1}
                    max={512}
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="h-8 text-sm font-mono"
                  />
                  {patch.fixtureKey === 'manual' && editChannels.map((ch, ci) => (
                    <div key={ci} className="contents">
                      <label className="text-text-faint text-xs">{t`Ch ${ci + 1}`}</label>
                      <Input
                        value={ch}
                        onChange={(e) => {
                          const updated = [...editChannels]
                          updated[ci] = e.target.value
                          setEditChannels(updated)
                        }}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 mt-3 justify-end">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { setEditingIndex(null); setError(null) }} disabled={saving}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={saveEdit} disabled={saving}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          }

          return (
            <div key={index} className="rounded border border-border bg-surface p-3 flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-text font-semibold text-sm">{patch.label}</span>
                {patch.label !== displayName && (
                  <span className="text-text-dim text-xs truncate">{displayName}</span>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {channelCount}ch
              </Badge>
              <span className="text-text-faint text-xs font-mono shrink-0">
                {patch.startAddress}–{endAddress}
              </span>
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-error-text text-xs mr-1">{t`Delete?`}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7 border-error-border text-error-text hover:bg-error-bg" onClick={() => deletePatch(index)} disabled={saving}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setConfirmDeleteIndex(null)} disabled={saving}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => startEdit(index)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7 text-text-faint hover:text-error-text hover:border-error-border" onClick={() => { setConfirmDeleteIndex(index); setEditingIndex(null); setError(null) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {patches.length === 0 && !showPicker && (
          <div className="text-text-faint text-sm text-center py-8">
            {t`No fixtures patched. Click "Add Fixture" to get started.`}
          </div>
        )}
      </div>

      {patches.length > 0 && (
        <ChannelStrip patches={patches} fixtures={fixtures} />
      )}
    </div>
  )
}
```

**Step 2: Typecheck won't pass yet** — FixturePicker and ChannelStrip don't exist. That's Tasks 8 and 9.

**Step 3: Commit**

```bash
git add ui/src/components/config/PatchPanel.tsx
git commit -m "feat(ui): add PatchPanel for fixture-to-universe assignment"
```

---

### Task 8: Create FixturePicker component

**Files:**
- Create: `ui/src/components/config/FixturePicker.tsx`

This is the modal/inline picker for selecting a fixture from the library or creating a manual one.

**Step 1: Create FixturePicker.tsx**

```tsx
import { useState } from 'react'
import { t } from '@lingui/core/macro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Fixture } from '@/types'

interface FixturePickerProps {
  fixtures: Record<string, Fixture> | null
  onSelect: (fixtureKey: string, channels?: string[]) => void
  onCancel: () => void
}

export function FixturePicker({ fixtures, onSelect, onCancel }: FixturePickerProps) {
  const [mode, setMode] = useState<'library' | 'manual'>('library')
  const [manualCount, setManualCount] = useState('3')
  const [search, setSearch] = useState('')

  function handleManualCreate() {
    const count = parseInt(manualCount, 10)
    if (isNaN(count) || count < 1 || count > 512) return
    const channels = Array.from({ length: count }, (_, i) => `Ch ${i + 1}`)
    onSelect('manual', channels)
  }

  if (mode === 'manual') {
    return (
      <div className="rounded border border-accent/40 bg-surface p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{t`Manual Fixture`}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-xs text-text-muted">{t`Channels`}</label>
          <Input
            type="number"
            min={1}
            max={512}
            value={manualCount}
            onChange={(e) => setManualCount(e.target.value)}
            className="h-8 text-sm w-20"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setMode('library')}>
            {t`Back`}
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleManualCreate}>
            {t`Create`}
          </Button>
        </div>
      </div>
    )
  }

  // Library mode
  const grouped = new Map<string, [string, Fixture][]>()
  if (fixtures) {
    const lowerSearch = search.toLowerCase()
    for (const [key, fixture] of Object.entries(fixtures)) {
      if (lowerSearch && !fixture.name.toLowerCase().includes(lowerSearch) && !key.toLowerCase().includes(lowerSearch)) {
        continue
      }
      const list = grouped.get(fixture.manufacturer) ?? []
      list.push([key, fixture])
      grouped.set(fixture.manufacturer, list)
    }
  }
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="rounded border border-accent/40 bg-surface p-4 mb-4 max-h-80 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{t`Select Fixture`}</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex gap-2 mb-3">
        <Input
          placeholder={t`Search fixtures...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm flex-1"
        />
        <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => setMode('manual')}>
          {t`Manual`}
        </Button>
      </div>

      {!fixtures ? (
        <div className="text-text-muted text-xs text-center py-4">{t`Loading fixtures...`}</div>
      ) : sortedGroups.length === 0 ? (
        <div className="text-text-muted text-xs text-center py-4">{t`No fixtures found`}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedGroups.map(([manufacturer, items]) => (
            <div key={manufacturer}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                {manufacturer}
              </div>
              <div className="flex flex-col gap-1">
                {items.sort(([, a], [, b]) => a.name.localeCompare(b.name)).map(([key, fixture]) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      'w-full text-left rounded px-3 py-2 text-sm',
                      'border border-border hover:border-accent/40 hover:bg-accent/5',
                      'transition-colors cursor-pointer'
                    )}
                    onClick={() => onSelect(key)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fixture.shortName}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {fixture.channelCount}ch
                      </Badge>
                    </div>
                    <div className="text-[10px] text-text-faint mt-0.5">
                      {fixture.channels.join(' · ')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add ui/src/components/config/FixturePicker.tsx
git commit -m "feat(ui): add FixturePicker for library and manual fixture selection"
```

---

### Task 9: Create ChannelStrip visualization

**Files:**
- Create: `ui/src/components/config/ChannelStrip.tsx`

Horizontal channel strip showing fixture blocks as colored segments with smart range display.

**Step 1: Create ChannelStrip.tsx**

```tsx
import { t } from '@lingui/core/macro'
import { cn } from '@/lib/utils'
import type { Patch, Fixture } from '@/types'

interface ChannelStripProps {
  patches: Patch[]
  fixtures: Record<string, Fixture> | null
}

const FIXTURE_COLORS = [
  'bg-accent/30 border-accent/50',
  'bg-blue-500/20 border-blue-500/40',
  'bg-emerald-500/20 border-emerald-500/40',
  'bg-amber-500/20 border-amber-500/40',
  'bg-purple-500/20 border-purple-500/40',
  'bg-rose-500/20 border-rose-500/40',
  'bg-cyan-500/20 border-cyan-500/40',
  'bg-orange-500/20 border-orange-500/40',
]

function getChannelCount(patch: Patch, fixtures: Record<string, Fixture> | null): number {
  if (patch.fixtureKey === 'manual') return patch.channels?.length ?? 0
  return fixtures?.[patch.fixtureKey]?.channelCount ?? 0
}

function getChannelNames(patch: Patch, fixtures: Record<string, Fixture> | null): string[] {
  if (patch.fixtureKey === 'manual') return patch.channels ?? []
  return fixtures?.[patch.fixtureKey]?.channels ?? []
}

export function ChannelStrip({ patches, fixtures }: ChannelStripProps) {
  if (patches.length === 0) return null

  // Determine display range: 1 to (last occupied channel + 4 padding), min 16
  let maxChannel = 0
  for (const p of patches) {
    const end = p.startAddress + getChannelCount(p, fixtures) - 1
    if (end > maxChannel) maxChannel = end
  }
  const displayEnd = Math.max(16, maxChannel + 4)

  // Build channel map: channel number -> { patch index, channel name, position in fixture }
  const channelMap = new Map<number, { patchIndex: number; name: string }>()
  for (let pi = 0; pi < patches.length; pi++) {
    const p = patches[pi]
    const names = getChannelNames(p, fixtures)
    const count = getChannelCount(p, fixtures)
    for (let i = 0; i < count; i++) {
      channelMap.set(p.startAddress + i, { patchIndex: pi, name: names[i] ?? `Ch ${i + 1}` })
    }
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-text-muted mb-2">{t`Channel Map`}</h3>
      <div className="flex flex-wrap gap-px">
        {Array.from({ length: displayEnd }, (_, i) => {
          const ch = i + 1
          const entry = channelMap.get(ch)
          const colorClass = entry ? FIXTURE_COLORS[entry.patchIndex % FIXTURE_COLORS.length] : ''

          return (
            <div
              key={ch}
              className={cn(
                'w-8 h-10 flex flex-col items-center justify-center rounded-sm border text-[9px]',
                entry
                  ? colorClass
                  : 'bg-surface border-border/50 text-text-faint'
              )}
              title={entry ? `${ch}: ${entry.name} (${patches[entry.patchIndex].label})` : `${ch}: ${t`empty`}`}
            >
              <span className="font-mono leading-none">{ch}</span>
              {entry && (
                <span className="truncate w-full text-center leading-none mt-0.5 text-[7px]">
                  {entry.name}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — all components now exist and types are consistent

**Step 3: Commit**

```bash
git add ui/src/components/config/ChannelStrip.tsx
git commit -m "feat(ui): add ChannelStrip visualization for universe patches"
```

---

### Task 10: Fix PatchPanel fixture fetch (useEffect, not useState)

**Files:**
- Modify: `ui/src/components/config/PatchPanel.tsx`

**Step 1: Fix the fixture fetch**

In `PatchPanel.tsx`, the fixture fetch incorrectly uses `useState` as an initializer. Change:

```tsx
// WRONG — useState callback
useState(() => {
  fetch('/api/fixtures')
```

To:

```tsx
import { useState, useEffect } from 'react'
// ...
useEffect(() => {
  fetch('/api/fixtures')
    .then((r) => r.json() as Promise<Record<string, Fixture>>)
    .then(setFixtures)
    .catch(() => {})
}, [])
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add ui/src/components/config/PatchPanel.tsx
git commit -m "fix(ui): use useEffect for fixture fetch in PatchPanel"
```

---

### Task 11: Extract shared channel helpers

**Files:**
- Create: `ui/src/components/config/patch-utils.ts`
- Modify: `ui/src/components/config/PatchPanel.tsx`
- Modify: `ui/src/components/config/ChannelStrip.tsx`

The `getChannelCount`, `getChannelNames`, `nextFreeAddress`, and `hasOverlap` functions are duplicated between PatchPanel and ChannelStrip. Extract them.

**Step 1: Create patch-utils.ts**

```ts
import type { Patch, Fixture } from '@/types'

export function getChannelCount(patch: Patch, fixtures: Record<string, Fixture> | null): number {
  if (patch.fixtureKey === 'manual') return patch.channels?.length ?? 0
  return fixtures?.[patch.fixtureKey]?.channelCount ?? 0
}

export function getChannelNames(patch: Patch, fixtures: Record<string, Fixture> | null): string[] {
  if (patch.fixtureKey === 'manual') return patch.channels ?? []
  return fixtures?.[patch.fixtureKey]?.channels ?? []
}

export function nextFreeAddress(patches: Patch[], fixtures: Record<string, Fixture> | null): number {
  if (patches.length === 0) return 1
  const occupied = new Set<number>()
  for (const p of patches) {
    const count = getChannelCount(p, fixtures)
    for (let i = 0; i < count; i++) {
      occupied.add(p.startAddress + i)
    }
  }
  for (let addr = 1; addr <= 512; addr++) {
    if (!occupied.has(addr)) return addr
  }
  return 1
}

export function hasOverlap(
  patches: Patch[],
  fixtures: Record<string, Fixture> | null
): { channel: number; a: string; b: string } | null {
  const occupied = new Map<number, string>()
  for (const p of patches) {
    const count = getChannelCount(p, fixtures)
    for (let i = 0; i < count; i++) {
      const ch = p.startAddress + i
      const existing = occupied.get(ch)
      if (existing) return { channel: ch, a: existing, b: p.label }
      occupied.set(ch, p.label)
    }
  }
  return null
}
```

**Step 2: Update PatchPanel.tsx and ChannelStrip.tsx**

Remove the local `getChannelCount`, `getChannelNames`, `nextFreeAddress`, `hasOverlap` functions and import from `./patch-utils`:

```ts
import { getChannelCount, getChannelNames, nextFreeAddress, hasOverlap } from './patch-utils'
```

For ChannelStrip, import only what it uses:

```ts
import { getChannelCount, getChannelNames } from './patch-utils'
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add ui/src/components/config/patch-utils.ts ui/src/components/config/PatchPanel.tsx ui/src/components/config/ChannelStrip.tsx
git commit -m "refactor(ui): extract shared patch utility functions"
```

---

### Task 12: i18n extraction and compilation

**Files:**
- Modify: `ui/src/locales/en/messages.po` (auto-generated)
- Modify: `ui/src/locales/en/messages.ts` (auto-generated)

**Step 1: Extract new strings**

Run: `pnpm --filter ui i18n:extract`
Expected: New strings added to `messages.po`

**Step 2: Compile catalogs**

Run: `pnpm --filter ui i18n:compile`
Expected: `messages.ts` updated

**Step 3: Commit**

```bash
git add ui/src/locales/
git commit -m "chore(i18n): extract and compile new patch panel strings"
```

---

### Task 13: Full CI verification

**Step 1: Run lint**

Run: `pnpm lint && cd server && go vet ./...`
Expected: PASS

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Run tests**

Run: `pnpm test && cd server && go test ./...`
Expected: PASS

**Step 4: Run build**

Run: `pnpm build && cd server && go build -o penumbra-server .`
Expected: PASS

**Step 5: Manual smoke test**

Run `task dev` (or `task server:dev` + `task watch:ui` + `task fake` in separate terminals). Navigate to Universes in the sidebar:
- Click a universe → PatchPanel appears on the right
- Click "Add Fixture" → FixturePicker shows library grouped by manufacturer
- Select a fixture → it appears in the patch list, auto-placed at address 1
- Add a second fixture → auto-placed after the first
- Edit a fixture → change address and label
- Try overlapping addresses → error message appears
- Delete a fixture → confirm dialog, channel range freed
- Channel strip shows fixture blocks with channel names
- Click "Manual" in picker → create a 3-channel manual fixture → edit channel names

**Step 6: Commit any fixes, then final commit if needed**

---

### Task 14: Squash-merge prep and PR

**Step 1: Push branch and create PR**

```bash
git push -u origin fixture-universe-assignment
gh pr create --title "feat: fixture-to-universe assignment with patch panel" --body "$(cat <<'EOF'
## Summary
- Add `Patch` struct to Go config with server-side overlap validation
- PatchPanel UI: assign fixtures to universe channel ranges with auto-placement
- FixturePicker: select from library (grouped by manufacturer, searchable) or create manual fixtures
- ChannelStrip: horizontal channel map visualization showing fixture blocks
- Hard-block on overlapping patches; next-free-address auto-placement

Closes #16 (patch sheet layer — parameter wiring is separate follow-up)

## Test plan
- [ ] Go tests: `cd server && go test ./config/ -v` — overlap, range, manual fixture validation
- [ ] Typecheck: `pnpm typecheck`
- [ ] Smoke test: add/edit/delete fixtures on universes, verify channel strip, overlap errors
- [ ] Manual fixture: create, edit channel names, verify persistence
EOF
)"
```
