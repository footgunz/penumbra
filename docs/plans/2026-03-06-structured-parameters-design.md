# Structured Emitter Parameters & Group-Based Auto-Wiring

## Goal

Enable group-based parameter assignment in the mapping UI by adopting a `/` naming convention in emitter parameter keys, so users can wire an entire emitter group (e.g. all channels from one Ableton track) to a fixture patch in a single action.

## Context

The M4L emitter currently keys parameters as `{trackName}_{channelLabel}` (e.g. `par_front_Red`). The `_` delimiter is ambiguous because track names also contain underscores. This makes it impossible to reliably parse group vs. channel from the key.

## Wire Format & Naming Convention

**No protocol changes.** The wire format stays `Record<string, number>` everywhere -- UDP (emitter to server) and WebSocket (server to UI). Parameter names remain opaque strings in the transport layer.

**Naming convention:** Parameters use `/` as an optional group separator. `par_front/Red` means group `par_front`, channel `Red`. The `/` character is never produced by the track name sanitizer (`[^a-zA-Z0-9_]` replaced with `_`), so it is always an unambiguous split point.

Parameters without `/` are ungrouped and work exactly as today -- full backward compatibility.

**M4L change:** In `emitter.ts`, the key construction changes from `fixtureName + '_' + ch.label` to `fixtureName + '/' + ch.label`. One character change.

**Fake emitter change:** Same -- keys become `par_front/Red` instead of `par_front_Red`.

**Server, diff engine, state mirror, E1.31:** No changes. Parameter names remain opaque strings throughout the Go pipeline.

## Mapping Config Format

No structural change to `config.json`. The `parameters` map stays `Record<string, ParameterConfig[]>` -- flat parameter name to channel targets.

```json
{
  "parameters": {
    "par_front/Red":    [{"universe": 1, "channel": 1}],
    "par_front/Green":  [{"universe": 1, "channel": 2}],
    "par_front/Blue":   [{"universe": 1, "channel": 3}],
    "mover_back/Pan":   [{"universe": 2, "channel": 1}]
  }
}
```

Group assignments are expanded into individual entries by the UI at save time. The server does a flat key lookup -- no resolution, no fixture library dependency. Fan-out still works (multiple targets per parameter). Hand-editing remains straightforward.

## Mapping UI -- Group Selection & Auto-Wiring

### Group selection

When the user clicks a parameter like `par_front/Red` in the mapping table, the UI auto-selects all parameters sharing the same group prefix (`par_front/*`). The user can deselect individual channels to break out of the group for custom wiring.

### Assignment flow

1. User selects a parameter (or group auto-selects).
2. User clicks "Assign to..." and picks a target fixture patch from a universe.
3. UI matches channel names between the selected group and the target fixture -- `Red` to `Red`, `Green` to `Green`, etc. Order does not matter.
4. Unmatched channels (e.g. fixture has `White` but emitter group does not) are left unmapped.
5. UI writes the expanded individual entries to config and saves via `POST /api/config`.

Ungrouped parameters (no `/` in the name) are selected and assigned individually.

**No auto-wiring on load.** Matching is only triggered by explicit user action. The user always sees what will be mapped before it is saved.

### MappingPanel UI changes

**Visual grouping:** Parameters with the same group prefix are displayed together with the group name as a row header. Ungrouped parameters appear at the bottom.

**Selection model:**
- Click a group header: select all channels in that group.
- Click an individual parameter: select just that one (group selection clears).
- Shift-click: add individual channels to selection.

**"Assign to..." button:** Appears when parameters are selected. Opens a picker showing universe/fixture patches (reusing existing config data). When a fixture is picked:
- Group selected: auto-match by channel name, show preview before confirming.
- Individual parameters selected: assign to sequential channels in the target fixture.

**Preview step:** Before saving, show which emitter channels map to which fixture channels. User can see unmatched channels and adjust before confirming.

**Read-only view preserved:** The table still shows live values, universe/channel/fixture resolution for already-mapped parameters. The selection and assignment UX layers on top.

## Testing Strategy

**M4L emitter:** Unit test in `device/scripts/src/lib/emitter.test.ts` verifies `emit()` produces keys with `/` separator.

**Fake emitter:** Update parameter keys to use `/`. Exercised by the existing dev workflow.

**UI:**
- Vitest unit tests for group-parsing utility (extract group from `par_front/Red`, handle ungrouped params, edge cases).
- Vitest tests for channel-name matching algorithm (exact matches, partial matches, order-independent, no matches).
- Component tests for group selection behavior.

**No server changes to test** -- parameter names remain opaque strings throughout the Go pipeline.
