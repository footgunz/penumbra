# Fixture-to-Universe Assignment — Design

**Date:** 2026-03-05
**Issue:** #16 (partially — patch sheet layer only; parameter wiring is separate)
**Status:** Approved

## Summary

Add UI and server support for assigning fixtures to universes with starting addresses. This is the "patch sheet" — what physical fixture occupies what DMX channels in each universe. Parameter wiring (which emitter values drive which channels) is a separate operation built on top of this.

## Data Model

New `Patch` struct and `Patches` array on `UniverseConfig`, replacing the existing `Channels map[string]string`.

### Config shape

```json
{
  "universes": {
    "1": {
      "device_ip": "192.168.1.101",
      "type": "wled",
      "label": "stage left",
      "patches": [
        {"fixtureKey": "generic/rgbw-4ch", "label": "Front Wash", "startAddress": 1},
        {"fixtureKey": "manual", "label": "LED Bar", "startAddress": 5, "channels": ["Dimmer", "Red", "Green", "Blue"]}
      ]
    }
  }
}
```

### Rules

- Library fixtures reference `fixtureKey` — channels resolved from fixture library at render time.
- Manual fixtures use `fixtureKey: "manual"` and carry their own `channels` array.
- `startAddress` is 1-indexed (DMX convention).
- `label` is the user-assigned instance name (not the fixture type name).
- The existing `channels` map on `UniverseConfig` is replaced by `patches`.

## Primary Flow

1. Select a universe (from the existing universe list in the config sidebar).
2. Click "Add Fixture".
3. Pick from fixture library (grouped by manufacturer) or "Manual" at the top.
4. If manual: enter channel count. Gets generic names ("Ch 1", "Ch 2"...), editable inline after placement.
5. Optionally enter an instance label ("Front Wash", "Back Fill").
6. Auto-placed at first free address — shown in the UI, editable before confirming.
7. Save via `POST /api/config`.

## Channel Strip (Visualization)

- Horizontal strip below the fixture list, showing channels 1 through last occupied + padding.
- Each fixture is a colored block spanning its channel range.
- Block shows fixture short name + instance label.
- Empty gaps shown as dimmed/hatched cells.
- Not draggable in v1 — purely visual. Rearranging done by editing start address.
- Overlaps are hard-blocked: placement won't allow an occupied address.

## Edit Operations

- **Edit start address** — numeric input, validated against conflicts (hard block on overlap).
- **Edit label** — inline text edit.
- **Edit channel names** — manual fixtures only, inline editable.
- **Delete fixture** — confirm dialog, frees the channel range.
- **Change fixture type** — swap the fixture definition. If shorter, channels freed. If longer, validated against conflicts.

## Conflict Resolution

- Hard block on overlap — can't place a fixture where channels are already occupied.
- "Next free address" calculation skips occupied ranges.
- Error message names the conflicting fixture if placement fails.
- Fan-out (one parameter driving multiple channels) handled at parameter wiring layer, not here.

## Server Changes

### config.go

- Add `Patch` struct: `FixtureKey string`, `Label string`, `StartAddress int`, `Channels []string` (optional, for manual fixtures).
- Add `Patches []Patch` to `UniverseConfig`.
- Remove `Channels map[string]string` from `UniverseConfig`.
- Validation on save: reject overlapping patches within a universe.

### Existing endpoints

- `GET /api/fixtures` already serves the fixture library — no new endpoints needed.
- `POST /api/config` handles persistence — patches are part of the universe config.

## UI Components

- `PatchPanel.tsx` — main view when a universe is selected in the config section.
- `FixturePicker.tsx` — modal/popover for selecting from library + manual option.
- `ChannelStrip.tsx` — horizontal channel visualization.
- Lives under the existing "Universes" config sub-tab, shown when a universe is selected/expanded.

## Not In Scope (v1)

- Drag-and-drop reordering on the channel strip.
- "Save manual fixture to library" promotion.
- Bulk operations (patch N identical fixtures at once).
- Copy/paste fixtures between universes.
- Parameter wiring (separate feature, builds on this).
