# Configuration Reference

Penumbra's universe and parameter mappings live in `server/config.json`. This
file is loaded at startup and updated live via `POST /api/config` (or the
Config tab in the UI). Changes persist to disk immediately.

---

## Schema

```json
{
  "universes": { ... },
  "parameters": { ... }
}
```

---

## `universes`

Maps universe numbers (string keys) to their network targets.

```json
"universes": {
  "1": {
    "device_ip": "192.168.1.101",
    "label": "stage left"
  },
  "2": {
    "device_ip": "192.168.1.102",
    "label": "stage right"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `device_ip` | string | IP address of the WLED/E1.31 device for this universe |
| `label` | string | Human-readable name shown in the UI |

Universe numbers must be positive integers expressed as string keys. Universe
`N` sends E1.31 multicast to `239.255.{N >> 8}.{N & 0xff}:5568`.

---

## `parameters`

Maps Live parameter names to DMX output targets.

```json
"parameters": {
  "track1_dimmer": [
    { "universe": 1, "channel": 1 }
  ],
  "track1_red": [
    { "universe": 1, "channel": 2 }
  ],
  "master_dimmer": [
    { "universe": 1, "channel": 1 },
    { "universe": 2, "channel": 1 }
  ]
}
```

Each parameter maps to an **array** of channel targets. This allows one
parameter to fan out to multiple universes and channels simultaneously (useful
for a master dimmer that controls all rigs).

| Field | Type | Description |
|-------|------|-------------|
| key | string | Parameter name — must match the name M4L sends (see [m4l-device.md](m4l-device.md)) |
| `universe` | integer | Universe number; must exist in `universes` |
| `channel` | integer | DMX channel within the universe (1–512) |

The server normalizes incoming float values (0.0–1.0) to DMX byte values
(0–255) on each tick.

---

## Naming convention

M4L generates parameter names from track names: lowercased, non-alphanumeric
characters replaced with `_`. Example: a track named "Stage Left" produces
parameters `stage_left_volume`, `stage_left_pan`, `stage_left_send_0`.

See [m4l-device.md](m4l-device.md) for the full parameter list.

---

## Full example

```json
{
  "universes": {
    "1": { "device_ip": "192.168.1.101", "label": "stage left" },
    "2": { "device_ip": "192.168.1.102", "label": "stage right" }
  },
  "parameters": {
    "track1_volume":  [{ "universe": 1, "channel": 1 }],
    "track1_red":     [{ "universe": 1, "channel": 2 }],
    "track1_green":   [{ "universe": 1, "channel": 3 }],
    "track1_blue":    [{ "universe": 1, "channel": 4 }],
    "master_dimmer":  [
      { "universe": 1, "channel": 1 },
      { "universe": 2, "channel": 1 }
    ]
  }
}
```

---

## Upcoming fields

Widget and zone configuration fields will be added to this document when
issues [#27](https://github.com/footgunz/penumbra/issues/27) (display widgets)
and [#30](https://github.com/footgunz/penumbra/issues/30) (WLED pixel zones)
are implemented.
