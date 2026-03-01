# WLED Pixel Zones — Design

**Date:** 2026-03-01
**Status:** Approved

---

## Problem

The current config maps M4L parameters to individual DMX channels (`{universe, channel}`). For WLED devices running in E1.31 Multi RGB mode, a single logical colour (e.g. "red of the stage left wash") needs to be written to the same byte offset across every pixel in a strip segment — potentially 20, 60, or 200 writes per frame. Listing every channel individually in `config.json` is impractical and error-prone.

---

## Solution

A **zone** is a WLED-specific channel expansion rule. When the E1.31 dispatcher encounters a parameter write that targets a channel covered by a zone, it replicates the value across the corresponding byte of every pixel in the zone's pixel range instead of writing a single DMX byte. From the parameter mapping layer's perspective nothing changes — zones are a transparent dispatcher-side enhancement.

---

## Design Decisions

- **Zones are top-level in config.json** (parallel to `universes` and `parameters`). They are portable, can be copy-pasted between configs, and may reference universes that do not yet exist — in which case the dispatcher silently skips them.
- **No zone cache required.** Dispatch fires at most 25 Hz on state change; iterating a small zone map (O(zones × targets)) per dispatch is microseconds. Not worth the invalidation complexity a cache would introduce.
- **WLED requires no runtime configuration push.** Zones are purely a server-side authoring aid. WLED running E1.31 in Multi RGB mode interprets the correctly-composed DMX buffer without any awareness of zones.
- **Raw channel mapping is fully preserved.** Non-WLED fixtures (single-channel dimmers, moving heads, etc.) continue to use `{universe, channel}` with no zone involvement.
- **`color_order` is an arbitrary permutation string.** `"RGB"`, `"GRB"`, `"RBG"`, `"RGBW"`, `"GRBW"`, etc. The string length determines bytes-per-pixel; position determines which offset in each pixel group a given channel offset writes to.

---

## Config Schema

```json
{
  "universes": { ... },
  "parameters": { ... },
  "zones": {
    "stage_left_wash": {
      "label": "Stage Left Wash",
      "universe": 1,
      "start_channel": 1,
      "pixel_count": 20,
      "color_order": "RGB"
    },
    "stage_right_wash": {
      "label": "Stage Right Wash",
      "universe": 1,
      "start_channel": 61,
      "pixel_count": 20,
      "color_order": "GRB"
    }
  }
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `label` | string | Human-readable display name |
| `universe` | int | DMX universe this zone lives in |
| `start_channel` | int | First DMX channel of the zone (1-indexed). R (or first color_order byte) of pixel 0. |
| `pixel_count` | int | Number of pixels in the zone |
| `color_order` | string | Byte order per pixel: `"RGB"`, `"GRB"`, `"RBG"`, `"BGR"`, `"RGBW"`, `"GRBW"`, etc. Length = bytes per pixel. |

### Derived values (for UI display)

- **Bytes per pixel:** `len(color_order)` — 3 for RGB variants, 4 for RGBW variants
- **Channel range:** `start_channel` to `start_channel + (pixel_count × bytes_per_pixel) - 1`

### Parameter mapping (unchanged)

```json
"parameters": {
  "track1_red":   [{ "universe": 1, "channel": 1 }],
  "track1_green": [{ "universe": 1, "channel": 2 }],
  "track1_blue":  [{ "universe": 1, "channel": 3 }]
}
```

Channel 1 targets `start_channel` of `stage_left_wash` → the dispatcher expands it to the first color-order byte of all 20 pixels.

---

## Go Server

### `config/config.go`

```go
type ZoneConfig struct {
    Label        string `json:"label"`
    Universe     int    `json:"universe"`
    StartChannel int    `json:"start_channel"`
    PixelCount   int    `json:"pixel_count"`
    ColorOrder   string `json:"color_order"`
}

type Config struct {
    Universes  map[int]UniverseConfig     `json:"universes"`
    Parameters map[string]ParameterConfig `json:"parameters"`
    Zones      map[string]ZoneConfig      `json:"zones,omitempty"`
    path       string
}
```

### `e131/e131.go` — zone expansion logic

`Dispatch` delegates each channel write to a `writeChannel` helper. The helper:

1. Iterates `cfg.Zones`. Skips zones on a different universe immediately.
2. For a matching zone, computes `bpp = len(zone.ColorOrder)` and checks whether `channel` falls in `[start_channel, start_channel + bpp - 1]`.
3. If matched: `color_offset = channel - zone.StartChannel`. Writes `value` to `(start_channel - 1) + i*bpp + color_offset` for every pixel `i` in `0..pixel_count-1`. Returns — no further zone or raw write.
4. If no zone matched: writes the single byte at `channel - 1` (existing behaviour).

---

## Protocol Types

`packages/protocol-types/index.ts` — add `ZoneConfig` to match the Go struct:

```ts
export interface ZoneConfig {
  label: string
  universe: number
  start_channel: number
  pixel_count: number
  color_order: string
}
```

`SetConfigMessage` gains an optional `zones` field:

```ts
export interface SetConfigMessage {
  type: 'set_config'
  universes?: Record<number, UniverseConfig>
  parameters?: Record<string, ParameterConfig>
  zones?: Record<string, ZoneConfig>
}
```

---

## UI

### Configure tab — sub-tab navigation

The Configure tab is restructured into three sub-tabs:

```
Configure
  Universes  |  Mapping  |  Zones
```

A parent `<ConfigEditor>` component fetches the full config once on mount (`GET /api/config`) and holds it as a single state object `{ universes, parameters, zones }`. Each sub-tab receives its slice of config plus a setter. Saves post via `POST /api/config`.

Shared state means:
- The Zones tab has the universe list available for its universe dropdown without a separate fetch.
- The Zones tab can cross-reference which parameters target channels within a zone's channel range (verification aid).
- Future tabs (Mapping, Universes) have access to zone names for annotations.

### Zones sub-tab

A list of configured zones. Each zone can be added, edited, or deleted.

**Zone form fields:**

| Field | Input type | Notes |
|---|---|---|
| Key | text | JSON key / identifier |
| Label | text | Display name |
| Universe | dropdown | Populated from `config.universes` |
| Start channel | number | 1-indexed |
| Pixel count | number | |
| Color order | dropdown | RGB, GRB, RBG, BGR, RGBW, GRBW |

**Derived (read-only, computed in UI):**
- Channel range: `start_channel` – `start_channel + (pixel_count × bytes_per_pixel) - 1`
- Parameters targeting this zone: cross-referenced from shared `config.parameters`

The JSON config editor remains as a power-user escape hatch.

---

## Issue Breakdown

| Issue | Scope |
|---|---|
| `feat(server): WLED pixel zone config and E1.31 expansion` | Go config type, E1.31 dispatcher, protocol-types |
| `feat(ui): Configure — sub-tab navigation with shared config state` | Restructure ConfigEditor; unblocks #14, #16, and zones editor |
| `feat(ui): zones editor` | Zone CRUD form; blocked by sub-tab navigation issue |
