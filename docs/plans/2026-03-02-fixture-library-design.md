# Fixture Library Design

**Date:** 2026-03-02
**Issue:** #36
**PR:** #37

---

## Goal

Replace the current M4L LOM mixer approach with a flexible per-fixture channel strip model. Each M4L instrument track represents one fixture instance. The track emits labeled DMX channel values to the server, which maps them to physical DMX channels via the existing parameters config.

---

## Core Design

### M4L Device

A fixed pool of 16 `live.dial` objects always exists in the patch — no dynamic object creation. JS maintains a channel array:

```ts
channels: Array<{ active: boolean, label: string, value: number }>
```

On each emit tick, only active channels are included in the UDP payload:

```
{ "stage_left_Dimmer": 0.8, "stage_left_Red": 1.0, "stage_left_Green": 0.5 }
```

Key: `{track_name}_{label}` where `track_name` is read from `this_device canonical_parent name`.

**Presets** are baked into JS as a static map — no dynamic patch objects, no external files:

```ts
const PRESETS = {
  "6ch PAR":    [{ label: "Dimmer" }, { label: "Red" }, { label: "Green" }, { label: "Blue" }, { label: "Strobe" }, { label: "Mode" }],
  "RGBW Par":   [{ label: "Red" }, { label: "Green" }, { label: "Blue" }, { label: "White" }],
  "Dimmer":     [{ label: "Dimmer" }],
  "Moving Head Basic": [{ label: "Pan" }, { label: "Tilt" }, { label: "Dimmer" }, { label: "Color" }, { label: "Gobo" }, { label: "Speed" }],
}
```

Selecting a preset:
1. Updates the JS channel array (active flags + labels)
2. Sends `thispatcher` messages to show/hide the corresponding `live.dial` objects
3. Does not affect the emit tick cadence

Labels come from a well-known list (`Dimmer`, `Red`, `Green`, `Blue`, `White`, `Pan`, `Tilt`, `Strobe`, `Gobo`, `Zoom`, `Focus`, `Color`, `Speed`, `Mode`) plus free-text entry. Labels are cosmetic for the performer — the server does not interpret them semantically.

Unused channels (active = false) are not emitted. The server never sees them.

**Split-tick behavior is preserved.** LOM reads and UDP emit remain on separate 40ms tasks offset by 20ms.

### Server

No structural changes. The existing parameters map handles properties named `{fixture}_{label}` identically to any other parameter. The server auto-discovers received properties on first receipt — this already works.

`config.json` continues to map each property to `{ universe, channel }`:

```json
{
  "parameters": {
    "stage_left_Dimmer": [{ "universe": 1, "channel": 1 }],
    "stage_left_Red":    [{ "universe": 1, "channel": 2 }],
    "stage_left_Green":  [{ "universe": 1, "channel": 3 }],
    "stage_left_Blue":   [{ "universe": 1, "channel": 4 }]
  }
}
```

### Config / PWA

For proof of concept, the existing JSON config editor is sufficient to wire properties to DMX channels.

A fixture wizard (sequential auto-assign, fixture grouping) is explicitly deferred — it's a UX improvement on top of a working system and does not block the core feature.

### Fake Emitter

Updated to emit fixture-style labeled properties (`track1_Dimmer`, `track1_Red`, etc.) so the server and UI can be exercised without a Live license.

---

## What Changes vs. Current Plan (PR #37)

The original plan in `docs/plans/2026-03-02-fixture-library.md` was designed around server-side fixture profiles and a semantic parameter superset in M4L. This design replaces it:

| Original plan | New design |
|---------------|------------|
| `server/fixture/profiles.go` — built-in fixture profiles | Not needed |
| `FixtureInstance` struct in config | Not needed (existing parameters map is sufficient) |
| E1.31 dispatcher refactor for fixture offset math | Not needed |
| `GET /api/fixtures` endpoint | Not needed |
| M4L fixed semantic superset (color_r, intensity, pan, …) | Replaced by per-preset active channel list with user labels |
| M4L fixture type dropdown controls visibility | Replaced by preset selector |

Server scope shrinks to: update `config.json` example. All meaningful new work is in M4L and the fake emitter.

---

## Proof of Concept Scope

1. **M4L device rewrite** — preset selector, 16-channel strip, `{track}_{label}` emission
2. **Fake emitter update** — emit `track1_Dimmer`, `track1_Red`, etc.
3. **`config.json` update** — example wiring for a 4-channel fixture
4. **End-to-end verification** — fake emitter → server → config → DMX channel output

Deferred:
- PWA fixture wizard / auto-assign
- Free-text label entry in M4L (presets only for PoC)
- MIDI note → scene trigger (separate issue)

---

## Key Constraints

- Max JS runtime is ES6 SpiderMonkey — no async/await, `?.`, `??`
- `live.dial` objects are fixed at patch design time — no dynamic creation
- `thispatcher` used to show/hide dial UI elements on preset change
- Preset list is baked into JS at release time; adding fixtures = a new release
- Track name is read from `this_device canonical_parent name` — renaming the track changes the emitted keys and requires re-wiring in config
