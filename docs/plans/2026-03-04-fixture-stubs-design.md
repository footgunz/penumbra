# Fixture Stubs Design

**Date:** 2026-03-04
**Status:** Approved
**Issue:** #49

## Goal

Create a `fixtures/` directory with placeholder fixture definition JSON files in the simplified format from issue #49. One file per fixture-mode combination. No tooling, no build integration — just the data files.

## Format

Each file is a single fixture at a single channel count:

```json
{
  "name": "SlimPAR Pro H USB (7ch)",
  "shortName": "SlimPAR 7ch",
  "manufacturer": "Chauvet DJ",
  "channelCount": 7,
  "channels": ["Dimmer", "Red", "Green", "Blue", "Amber", "White", "UV"]
}
```

- `name` — full name including channel count for disambiguation
- `shortName` — display label for UIs with limited space
- `manufacturer` — `"Generic"` for archetypes, real manufacturer for OFL-sourced
- `channelCount` — integer, must equal `channels.length` (enables filtering without parsing array)
- `channels` — ordered array, index 0 = DMX channel 1. Title case, normalized names.

No `modes` array. The file *is* the mode.

## Files

```
fixtures/
  generic/
    rgb-3ch.json
    rgbw-4ch.json
    rgbaw-6ch.json
    rgbawuv-7ch.json
    moving-head-8ch.json
    moving-head-16ch.json
  chauvet-dj/
    slimpar-pro-h-usb-6ch.json
    slimpar-pro-h-usb-7ch.json
    slimpar-pro-h-usb-12ch.json
  american-dj/
    mega-par-profile-plus-4ch.json
    mega-par-profile-plus-6ch.json
    mega-par-profile-plus-9ch.json
```

### Generic fixtures

Cover the range of common channel counts:

| File | Channels |
|------|----------|
| rgb-3ch | Red, Green, Blue |
| rgbw-4ch | Red, Green, Blue, White |
| rgbaw-6ch | Dimmer, Red, Green, Blue, Amber, White |
| rgbawuv-7ch | Dimmer, Red, Green, Blue, Amber, White, UV |
| moving-head-8ch | Pan, Tilt, Dimmer, Red, Green, Blue, White, Strobe |
| moving-head-16ch | Pan, Pan Fine, Tilt, Tilt Fine, Dimmer, Red, Green, Blue, White, Strobe, Color, Gobo, Gobo Rotation, Prism, Speed, Focus |

### Real fixtures (from OFL)

**Chauvet DJ SlimPAR Pro H USB** — popular budget RGBAW+UV par:
- 6ch: Red, Green, Blue, Amber, White, UV
- 7ch: Dimmer, Red, Green, Blue, Amber, White, UV
- 12ch: Dimmer, Red, Green, Blue, Amber, White, UV, Strobe, Color Macros, Mode, Program Speed, Dimmer Speed

**American DJ Mega Par Profile Plus** — common budget RGBUV par:
- 4ch: Red, Green, Blue, UV
- 6ch: Red, Green, Blue, UV, Strobe, Dimmer
- 9ch: Red, Green, Blue, UV, Strobe, Dimmer, Program Mode, Program Selection, Program Speed

## Channel name normalization

Title case. Common abbreviations expanded. These are the canonical names:

- `Red`, `Green`, `Blue`, `White`, `Amber`, `UV` (not R, G, B, W, A)
- `Dimmer` (not Dim, Master, Intensity)
- `Strobe` (not Shutter, Flash)
- `Pan`, `Tilt`, `Pan Fine`, `Tilt Fine`
- `Color`, `Gobo`, `Prism`, `Focus`, `Speed`
- `Color Macros`, `Program Mode`, `Program Selection`, `Program Speed`, `Dimmer Speed`

## Not in scope

- `tools/import-fixture` script (follow-up)
- Build pipeline integration (embedding in Go, injecting into M4L)
- Server API endpoints for fixtures
- UI FixturesPanel implementation
- Validation tooling (`channelCount === channels.length` check)
