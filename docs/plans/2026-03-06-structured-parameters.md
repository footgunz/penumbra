# Structured Emitter Parameters & Group-Based Auto-Wiring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch emitter parameter keys from `trackName_Channel` to `trackName/Channel` and build a mapping UI that can auto-wire emitter groups to fixture patches by matching channel names.

**Architecture:** The wire format stays `Record<string, number>` — only the key naming convention changes. The `/` separator is parsed purely in the UI for grouping and auto-match. The mapping config stores fully expanded individual entries; group logic lives only in the UI at assignment time.

**Tech Stack:** TypeScript (Vitest, React), Go (fake emitter only), LinguiJS i18n

---

### Task 1: Switch M4L emitter delimiter from `_` to `/`

**Files:**
- Modify: `device/scripts/src/lib/emitter.ts:83`
- Modify: `device/scripts/src/lib/emitter.test.ts:33-35,43,62,77`

**Step 1: Update the test expectations to use `/` delimiter**

In `device/scripts/src/lib/emitter.test.ts`, change every `_` between fixture name and channel label to `/`:

```ts
// Line 33-35: change keys in "active channels appear in emitted state" test
expect(pkt.state['stage_left/Dimmer']).toBeCloseTo(0.75)
expect(pkt.state['stage_left/Red']).toBeCloseTo(1.0)
expect(pkt.state['stage_left/Blue']).toBeUndefined()

// Line 43: change key in "inactive channels" test
e.setFixtureName('fixture')
// (no key to check — test checks Object.keys length is 0)

// Line 62: change key in "setChannelValue out of range" test
expect(pkt.state['f/Dimmer']).toBeCloseTo(0)

// Line 77: change key in "setChannels preserves existing values" test
expect(pkt.state['f/Dimmer']).toBeCloseTo(0.6)
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter device-scripts test`
Expected: 2 tests FAIL — `stage_left/Dimmer` and `f/Dimmer` are undefined because emitter still uses `_`.

**Step 3: Update emitter to use `/` delimiter**

In `device/scripts/src/lib/emitter.ts`, line 83, change:

```ts
// Before:
params[state.fixtureName + '_' + ch.label] = ch.value
// After:
params[state.fixtureName + '/' + ch.label] = ch.value
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter device-scripts test`
Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add device/scripts/src/lib/emitter.ts device/scripts/src/lib/emitter.test.ts
git commit -m "feat(emitter): use / delimiter between group and channel name"
```

---

### Task 2: Update fake emitter to use `/` delimiter

**Files:**
- Modify: `tools/fake-emitter/main.go:66`

**Step 1: Update the key format**

In `tools/fake-emitter/main.go`, in the `init()` function at line 66, change:

```go
// Before:
allParameters = append(allParameters, f.name+"_"+l)
// After:
allParameters = append(allParameters, f.name+"/"+l)
```

**Step 2: Verify it compiles**

Run: `cd /home/dgunther/Projects/penumbra/tools/fake-emitter && /usr/local/go/bin/go build .`
Expected: Compiles with no errors.

**Step 3: Update server config.json to match new keys**

In `server/config.json`, update all parameter keys from `_` to `/` delimiter:

```json
{
  "parameters": {
    "par_front/Dimmer": [{ "universe": 1, "channel": 1 }],
    "par_front/Red":    [{ "universe": 1, "channel": 2 }],
    "par_front/Green":  [{ "universe": 1, "channel": 3 }],
    "par_front/Blue":   [{ "universe": 1, "channel": 4 }],
    "par_front/Strobe": [{ "universe": 1, "channel": 5 }],
    "par_front/Mode":   [{ "universe": 1, "channel": 6 }],
    "mover_back/Pan":     [{ "universe": 2, "channel": 1 }],
    "mover_back/Tilt":    [{ "universe": 2, "channel": 2 }],
    "mover_back/Dimmer":  [{ "universe": 2, "channel": 3 }],
    "mover_back/Color":   [{ "universe": 2, "channel": 4 }],
    "mover_back/Gobo":    [{ "universe": 2, "channel": 5 }],
    "mover_back/Speed":   [{ "universe": 2, "channel": 6 }]
  }
}
```

Keep `universes`, `emitter`, and `blackout_scene` sections unchanged.

**Step 4: Commit**

```bash
git add tools/fake-emitter/main.go server/config.json
git commit -m "feat(fake-emitter): use / delimiter, update config.json keys"
```

---

### Task 3: Group-parsing utility with tests

**Files:**
- Create: `ui/src/components/config/mapping-utils.ts`
- Create: `ui/src/components/config/mapping-utils.test.ts`

**Step 1: Write the failing tests**

Create `ui/src/components/config/mapping-utils.test.ts`:

```ts
import { parseParam, groupParams, matchChannels } from './mapping-utils'

describe('parseParam', () => {
  it('splits on first / into group and channel', () => {
    expect(parseParam('par_front/Red')).toEqual({ group: 'par_front', channel: 'Red' })
  })

  it('returns null group for params without /', () => {
    expect(parseParam('some_legacy_param')).toEqual({ group: null, channel: 'some_legacy_param' })
  })

  it('handles multiple / by splitting on first only', () => {
    expect(parseParam('a/b/c')).toEqual({ group: 'a', channel: 'b/c' })
  })
})

describe('groupParams', () => {
  it('groups params by prefix', () => {
    const params = ['par/Red', 'par/Green', 'mover/Pan', 'legacy']
    const result = groupParams(params)
    expect(result).toEqual([
      { group: 'par', channels: ['par/Red', 'par/Green'] },
      { group: 'mover', channels: ['mover/Pan'] },
      { group: null, channels: ['legacy'] },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(groupParams([])).toEqual([])
  })

  it('preserves insertion order of groups', () => {
    const params = ['b/X', 'a/Y', 'b/Z']
    const result = groupParams(params)
    expect(result[0].group).toBe('b')
    expect(result[1].group).toBe('a')
  })
})

describe('matchChannels', () => {
  it('matches emitter channels to fixture channels by name', () => {
    const emitterChannels = ['Red', 'Green', 'Blue']
    const fixtureChannels = ['Blue', 'Green', 'Red', 'White']
    const result = matchChannels(emitterChannels, fixtureChannels)
    expect(result).toEqual([
      { emitterChannel: 'Red', fixtureIndex: 2 },
      { emitterChannel: 'Green', fixtureIndex: 1 },
      { emitterChannel: 'Blue', fixtureIndex: 0 },
    ])
  })

  it('skips emitter channels with no fixture match', () => {
    const result = matchChannels(['Red', 'UV'], ['Red', 'Green'])
    expect(result).toEqual([
      { emitterChannel: 'Red', fixtureIndex: 0 },
    ])
  })

  it('is case-insensitive', () => {
    const result = matchChannels(['red'], ['Red'])
    expect(result).toEqual([
      { emitterChannel: 'red', fixtureIndex: 0 },
    ])
  })

  it('returns empty array when nothing matches', () => {
    expect(matchChannels(['X'], ['Y'])).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter ui test -- mapping-utils`
Expected: FAIL — module `./mapping-utils` does not exist.

**Step 3: Implement the utilities**

Create `ui/src/components/config/mapping-utils.ts`:

```ts
export interface ParsedParam {
  group: string | null
  channel: string
}

/** Split a parameter name on the first `/`. No `/` means ungrouped. */
export function parseParam(name: string): ParsedParam {
  const idx = name.indexOf('/')
  if (idx === -1) return { group: null, channel: name }
  return { group: name.slice(0, idx), channel: name.slice(idx + 1) }
}

export interface ParamGroup {
  group: string | null
  channels: string[] // full param names (e.g. "par_front/Red")
}

/** Group a sorted list of parameter names by their `/` prefix. */
export function groupParams(paramNames: string[]): ParamGroup[] {
  const groups: ParamGroup[] = []
  const seen = new Map<string | null, ParamGroup>()

  for (const name of paramNames) {
    const { group } = parseParam(name)
    const key = group
    let entry = seen.get(key)
    if (!entry) {
      entry = { group, channels: [] }
      seen.set(key, entry)
      groups.push(entry)
    }
    entry.channels.push(name)
  }
  return groups
}

export interface ChannelMatch {
  emitterChannel: string
  fixtureIndex: number // 0-based index into the fixture's channel array
}

/** Match emitter channel names to fixture channel names (case-insensitive). */
export function matchChannels(
  emitterChannels: string[],
  fixtureChannels: string[],
): ChannelMatch[] {
  const fixtureLower = fixtureChannels.map((c) => c.toLowerCase())
  const matches: ChannelMatch[] = []

  for (const ec of emitterChannels) {
    const idx = fixtureLower.indexOf(ec.toLowerCase())
    if (idx !== -1) {
      matches.push({ emitterChannel: ec, fixtureIndex: idx })
    }
  }
  return matches
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter ui test -- mapping-utils`
Expected: All 9 tests PASS.

**Step 5: Commit**

```bash
git add ui/src/components/config/mapping-utils.ts ui/src/components/config/mapping-utils.test.ts
git commit -m "feat(ui): add group-parsing and channel-matching utilities"
```

---

### Task 4: Visual grouping in MappingPanel

**Files:**
- Modify: `ui/src/components/config/MappingPanel.tsx`

**Context:** The current MappingPanel renders a flat table of parameters. This task adds visual group headers — rows that span the full table width showing the group name (e.g. "par_front") before its channels. Ungrouped parameters appear at the bottom under no header. No selection or assignment yet — just visual structure.

**Step 1: Import the new utilities and restructure the table rendering**

Modify `ui/src/components/config/MappingPanel.tsx`. Add imports at the top:

```ts
import { groupParams, parseParam } from './mapping-utils'
```

Replace the `paramNames` → `rows` logic (lines 89-101) and the `<tbody>` section (lines 131-172) with grouped rendering:

```tsx
// In the component body, replace lines 89-101:
const paramNames = Object.keys(params).sort()

// ... (keep empty-state check as-is) ...

const groups = groupParams(paramNames)
const allRows = paramNames.map((name) =>
  resolveMapping(name, params[name], parameters, universes, fixtures),
)
const rowMap = new Map(allRows.map((r) => [r.paramName, r]))
const mappedCount = allRows.filter((r) => r.universe !== null).length
```

Replace the `<tbody>` with:

```tsx
<tbody>
  {groups.map((g) => {
    const groupChannels = g.channels
    return (
      <Fragment key={g.group ?? '__ungrouped'}>
        {g.group && (
          <tr className="bg-surface-raised/50">
            <td colSpan={5} className="py-1.5 px-1 text-xs font-semibold text-text-muted">
              {g.group}
            </td>
          </tr>
        )}
        {groupChannels.map((name) => {
          const row = rowMap.get(name)!
          const isMapped = row.universe !== null
          const { channel } = parseParam(row.paramName)
          return (
            <tr
              key={row.paramName}
              className={cn(
                'border-b border-border/50',
                !isMapped && 'opacity-40',
              )}
            >
              <td className="py-1.5 font-mono text-xs">
                {g.group ? (
                  <span className="pl-3">{channel}</span>
                ) : (
                  row.paramName
                )}
              </td>
              <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                {(row.value * 100).toFixed(0)}%
              </td>
              <td className="py-1.5 text-center text-xs">
                {isMapped ? (
                  <span title={row.universeLabel ?? undefined}>{row.universe}</span>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-1.5 text-center font-mono text-xs">
                {isMapped ? row.channel : '—'}
              </td>
              <td className="py-1.5 text-xs text-text-muted">
                {isMapped && row.fixtureLabel ? (
                  <>
                    <span>{row.fixtureLabel}</span>
                    {row.channelName && (
                      <span className="text-text-faint"> / {row.channelName}</span>
                    )}
                  </>
                ) : isMapped ? (
                  <span className="text-text-faint">{t`no fixture at this address`}</span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          )
        })}
      </Fragment>
    )
  })}
</tbody>
```

Add `Fragment` to the React import at line 1:

```ts
import { Fragment, useEffect, useState } from 'react'
```

**Step 2: Run typecheck and lint**

Run: `pnpm --filter ui typecheck && pnpm --filter ui lint`
Expected: Both pass with no errors.

**Step 3: Run i18n extract/compile**

Run: `pnpm --filter ui i18n:extract && pnpm --filter ui i18n:compile`
Expected: Extracts and compiles successfully. No new translatable strings needed (group names are data, not UI text).

**Step 4: Commit**

```bash
git add ui/src/components/config/MappingPanel.tsx ui/src/locales/
git commit -m "feat(ui): visually group emitter parameters by track prefix"
```

---

### Task 5: Group selection state and "Assign to..." button

**Files:**
- Modify: `ui/src/components/config/MappingPanel.tsx`
- Modify: `ui/src/App.tsx` (add `onSave` prop)

**Context:** This task adds click-to-select behavior and an "Assign to..." button. Clicking a group header selects all parameters in that group. Clicking individual parameters toggles them. The "Assign to..." button appears when parameters are selected but does not open a picker yet — that is Task 6.

**Step 1: Add selection state to MappingPanel**

Add `onSave` to `MappingPanelProps`:

```ts
interface MappingPanelProps {
  params: Record<string, number>
  parameters: Record<string, ParameterConfig>
  universes: Record<string, UniverseConfig>
  onSave: (parameters: Record<string, ParameterConfig>) => Promise<void>
}
```

Add selection state inside the component:

```ts
const [selected, setSelected] = useState<Set<string>>(new Set())

function toggleParam(name: string) {
  setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })
}

function selectGroup(group: ParamGroup) {
  setSelected((prev) => {
    const allSelected = group.channels.every((c) => prev.has(c))
    const next = new Set(prev)
    if (allSelected) {
      group.channels.forEach((c) => next.delete(c))
    } else {
      group.channels.forEach((c) => next.add(c))
    }
    return next
  })
}
```

**Step 2: Wire click handlers into the table**

Make group header rows clickable:

```tsx
{g.group && (
  <tr
    className="bg-surface-raised/50 cursor-pointer hover:bg-surface-raised"
    onClick={() => selectGroup(g)}
  >
    <td colSpan={5} className="py-1.5 px-1 text-xs font-semibold text-text-muted">
      <input
        type="checkbox"
        className="mr-2 align-middle"
        checked={g.channels.every((c) => selected.has(c))}
        readOnly
      />
      {g.group}
    </td>
  </tr>
)}
```

Make individual parameter rows clickable:

```tsx
<tr
  key={row.paramName}
  className={cn(
    'border-b border-border/50 cursor-pointer hover:bg-surface-raised/30',
    !isMapped && 'opacity-40',
    selected.has(row.paramName) && 'bg-accent/10',
  )}
  onClick={() => toggleParam(row.paramName)}
>
  <td className="py-1.5 font-mono text-xs">
    {g.group ? (
      <span className="pl-3">
        <input
          type="checkbox"
          className="mr-2 align-middle"
          checked={selected.has(row.paramName)}
          readOnly
        />
        {channel}
      </span>
    ) : (
      <>
        <input
          type="checkbox"
          className="mr-2 align-middle"
          checked={selected.has(row.paramName)}
          readOnly
        />
        {row.paramName}
      </>
    )}
  </td>
  {/* ... rest of row unchanged ... */}
</tr>
```

**Step 3: Add "Assign to..." button in the header area**

After the badges in the header `div`, add:

```tsx
{selected.size > 0 && (
  <button
    className="ml-auto text-xs bg-accent text-accent-foreground px-3 py-1 rounded hover:bg-accent/80"
    onClick={() => {/* Task 6 wires this up */}}
  >
    {t`Assign ${selected.size} to fixture...`}
  </button>
)}
```

**Step 4: Update App.tsx to pass `onSave`**

In `ui/src/App.tsx`, update the mapping case (around line 164):

```tsx
case 'mapping':
  return (
    <MappingPanel
      params={params}
      parameters={config.parameters}
      universes={config.universes}
      onSave={async (parameters) => {
        await saveConfig({ ...config, parameters })
      }}
    />
  )
```

**Step 5: Run typecheck, lint, i18n**

Run: `pnpm --filter ui typecheck && pnpm --filter ui lint && pnpm --filter ui i18n:extract && pnpm --filter ui i18n:compile`
Expected: All pass.

**Step 6: Commit**

```bash
git add ui/src/components/config/MappingPanel.tsx ui/src/App.tsx ui/src/locales/
git commit -m "feat(ui): add group selection and assign-to button in mapping panel"
```

---

### Task 6: Fixture patch picker and auto-wiring

**Files:**
- Modify: `ui/src/components/config/MappingPanel.tsx`

**Context:** When the user clicks "Assign to...", a dropdown/modal shows available fixture patches grouped by universe. Selecting one triggers the channel-name matching algorithm and shows a preview. On confirm, individual parameter entries are written to config.

**Step 1: Build the fixture-patch picker**

Add a state variable for the picker:

```ts
const [showPicker, setShowPicker] = useState(false)
```

Wire the "Assign to..." button:

```tsx
onClick={() => setShowPicker(true)}
```

Create a `PatchPicker` inline component or a separate section rendered below the header when `showPicker` is true. It should:

1. List all universe → patch combinations from `universes` prop
2. Show each as: `Universe {id} ({label}) → {patch.label} ({fixtureKey})`
3. On click, call a handler that:
   a. Gets the fixture's channel list (from the `fixtures` state already fetched by the component)
   b. Gets the selected emitter channels (parse channel names from selected param names using `parseParam`)
   c. Calls `matchChannels(emitterChannels, fixtureChannels)` to get matches
   d. Shows a preview before applying

The picker UI:

```tsx
{showPicker && (
  <div className="mb-4 border border-border rounded p-3 bg-surface">
    <div className="text-xs font-semibold text-text-muted mb-2">
      {t`Select target fixture patch:`}
    </div>
    {Object.entries(universes).map(([uid, uConfig]) =>
      (uConfig.patches ?? []).map((patch, pIdx) => (
        <button
          key={`${uid}-${pIdx}`}
          className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-raised"
          onClick={() => handleAssign(uid, patch)}
        >
          {t`Universe ${uid}`}
          {uConfig.label && <span className="text-text-faint"> ({uConfig.label})</span>}
          {' → '}
          {patch.label}
        </button>
      )),
    )}
    <button
      className="mt-2 text-xs text-text-muted hover:text-text"
      onClick={() => setShowPicker(false)}
    >
      {t`Cancel`}
    </button>
  </div>
)}
```

**Step 2: Implement the assignment handler with preview**

```ts
import { matchChannels, parseParam, type ChannelMatch } from './mapping-utils'
import { getChannelNames } from './patch-utils'

// State for preview
const [preview, setPreview] = useState<{
  universeId: string
  patch: Patch
  matches: ChannelMatch[]
  startAddress: number
} | null>(null)

function handleAssign(universeId: string, patch: Patch) {
  const fixtureChannelNames = patch.fixtureKey === 'manual'
    ? (patch.channels ?? [])
    : (fixtures?.[patch.fixtureKey]?.channels ?? [])

  const selectedNames = Array.from(selected)
  const emitterChannels = selectedNames.map((n) => parseParam(n).channel)

  const matches = matchChannels(emitterChannels, fixtureChannelNames)

  setPreview({ universeId, patch, matches, startAddress: patch.startAddress })
  setShowPicker(false)
}
```

**Step 3: Render the preview and confirm button**

```tsx
{preview && (
  <div className="mb-4 border border-border rounded p-3 bg-surface">
    <div className="text-xs font-semibold text-text-muted mb-2">
      {t`Mapping preview — ${preview.patch.label} (Universe ${preview.universeId})`}
    </div>
    {preview.matches.length === 0 ? (
      <div className="text-xs text-warning">{t`No matching channel names found.`}</div>
    ) : (
      <table className="w-full text-xs mb-2">
        <thead>
          <tr className="text-text-muted">
            <th className="text-left pb-1">{t`Emitter Channel`}</th>
            <th className="text-left pb-1">{t`Fixture Channel`}</th>
            <th className="text-center pb-1">{t`DMX Ch`}</th>
          </tr>
        </thead>
        <tbody>
          {preview.matches.map((m) => {
            const fixtureChannelNames = preview.patch.fixtureKey === 'manual'
              ? (preview.patch.channels ?? [])
              : (fixtures?.[preview.patch.fixtureKey]?.channels ?? [])
            return (
              <tr key={m.emitterChannel}>
                <td className="py-0.5 font-mono">{m.emitterChannel}</td>
                <td className="py-0.5 font-mono">{fixtureChannelNames[m.fixtureIndex]}</td>
                <td className="py-0.5 text-center">{preview.startAddress + m.fixtureIndex}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )}
    <div className="flex gap-2 mt-2">
      <button
        className="text-xs bg-accent text-accent-foreground px-3 py-1 rounded hover:bg-accent/80"
        onClick={confirmAssignment}
        disabled={preview.matches.length === 0}
      >
        {t`Confirm`}
      </button>
      <button
        className="text-xs text-text-muted hover:text-text"
        onClick={() => setPreview(null)}
      >
        {t`Cancel`}
      </button>
    </div>
  </div>
)}
```

**Step 4: Implement confirmAssignment**

This function builds the individual parameter entries and calls `onSave`:

```ts
async function confirmAssignment() {
  if (!preview) return

  const selectedNames = Array.from(selected)
  const updated = { ...parameters }

  for (const match of preview.matches) {
    // Find the full param name for this emitter channel
    const paramName = selectedNames.find(
      (n) => parseParam(n).channel.toLowerCase() === match.emitterChannel.toLowerCase(),
    )
    if (paramName) {
      updated[paramName] = [
        { universe: Number(preview.universeId), channel: preview.startAddress + match.fixtureIndex },
      ] as unknown as ParameterConfig
    }
  }

  await onSave(updated)
  setSelected(new Set())
  setPreview(null)
}
```

Note: The `as unknown as ParameterConfig` cast is needed because the TS type is `{universe, channel}` (single object) but the actual config format is an array. This matches the existing runtime handling in `resolveMapping`.

**Step 5: Run typecheck, lint, i18n**

Run: `pnpm --filter ui typecheck && pnpm --filter ui lint && pnpm --filter ui i18n:extract && pnpm --filter ui i18n:compile`
Expected: All pass.

**Step 6: Manual test with fake emitter**

1. Start the fake emitter: `cd /home/dgunther/Projects/penumbra/tools/fake-emitter && /usr/local/go/bin/go run . --mode animated`
2. Build UI: `pnpm --filter ui build`
3. Build Go server: `cd /home/dgunther/Projects/penumbra/server && /usr/local/go/bin/go build -o penumbra .`
4. Run server: `cd /home/dgunther/Projects/penumbra/server && ./penumbra`
5. Open `http://localhost:3000`, navigate to Mapping panel
6. Verify: parameters are grouped by track prefix (`par_front`, `mover_back`)
7. Click a group header — all channels in that group should select
8. Click "Assign to fixture..." — picker shows available patches
9. Select a patch — preview shows channel-name matches
10. Click Confirm — config saves, parameters show as mapped

**Step 7: Commit**

```bash
git add ui/src/components/config/MappingPanel.tsx ui/src/locales/
git commit -m "feat(ui): fixture patch picker with channel-name auto-wiring"
```

---

### Task 7: Final cleanup and PR

**Step 1: Run full CI checks locally**

```bash
pnpm typecheck && pnpm lint && pnpm test && cd /home/dgunther/Projects/penumbra/server && /usr/local/go/bin/go vet ./... && /usr/local/go/bin/go test ./...
```

Expected: All pass.

**Step 2: Push and create PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: structured parameters with group-based auto-wiring" --body "..."
```

**Step 3: Watch CI**

```bash
gh run watch
```
