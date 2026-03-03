# Fixture Library Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the flat `parameter → {universe, channel}` model with a fixture library — built-in profiles (Generic Par RGB/W, WLED Zone, Moving Head, Strobe), fixture instances in config, and a per-fixture M4L emitter that emits semantic parameters.

**Architecture:** A new `server/fixture/` package holds built-in profiles (hardcoded, not user-editable). `config.json` gains a `fixtures` field mapping instance names to `{profile, universe, start_channel}`. The E1.31 dispatcher resolves fixture instances via profile channel offsets. The existing `parameters` field is kept for backward compatibility (the fake emitter still uses it). M4L is rewritten as a per-fixture instrument: one device per track, reads its own dial values, emits `{fixture_name}_{semantic}` keys using the track name as prefix.

**Tech Stack:** Go 1.25 (server), TypeScript/ES6/esbuild (M4L device), MessagePack (UDP protocol)

---

## Background: how the pieces fit

### Current flow
```
M4L → {track1_volume: 0.8, track1_pan: 0.5} (UDP)
Server: cfg.Parameters["track1_volume"] → [{universe:1, channel:1}]
E1.31 dispatcher → writes DMX byte to universe 1 channel 1
```

### New flow (fixture model)
```
M4L → {stage_left_color_r: 0.8, stage_left_intensity: 0.9} (UDP)
Server: cfg.Fixtures["stage_left"] → {profile:"Generic Par RGBW", universe:1, start_channel:1}
fixture.BuiltinProfiles["Generic Par RGBW"].Channels["color_r"] → offset 1
→ DMX channel = start_channel + offset - 1 = 1
E1.31 dispatcher → writes 204 (0.8×255) to universe 1 channel 1
```

The server builds the expected state key as `{fixture_name}_{semantic}` and looks it up in the incoming state map. No ambiguous string parsing.

### Backward compatibility
The `parameters` field stays in `Config` and the dispatcher still handles it. The fake emitter keeps working as-is. New fixture instances are additive.

---

## Task 1: Server — fixture profiles package

**Files:**
- Create: `server/fixture/profiles.go`
- Create: `server/fixture/profiles_test.go`

### Step 1: Write the failing test

```go
// server/fixture/profiles_test.go
package fixture_test

import (
	"testing"
	"github.com/footgunz/penumbra/fixture"
)

func TestBuiltinProfilesExist(t *testing.T) {
	names := []string{
		"Generic Par RGB",
		"Generic Par RGBW",
		"WLED RGB Zone",
		"WLED RGBW Zone",
		"Moving Head",
		"Strobe",
	}
	for _, name := range names {
		if _, ok := fixture.BuiltinProfiles[name]; !ok {
			t.Errorf("missing profile %q", name)
		}
	}
}

func TestProfileChannelOffsets(t *testing.T) {
	p := fixture.BuiltinProfiles["Generic Par RGBW"]
	got := make(map[string]int)
	for _, ch := range p.Channels {
		got[ch.Semantic] = ch.Offset
	}
	want := map[string]int{
		"intensity": 0,
		"color_r":   1,
		"color_g":   2,
		"color_b":   3,
		"color_w":   4,
	}
	for semantic, wantOffset := range want {
		if gotOffset, ok := got[semantic]; !ok {
			t.Errorf("Generic Par RGBW missing semantic %q", semantic)
		} else if gotOffset != wantOffset {
			t.Errorf("Generic Par RGBW %q: got offset %d, want %d", semantic, gotOffset, wantOffset)
		}
	}
}

func TestProfileChannelCount(t *testing.T) {
	cases := []struct {
		profile string
		count   int
	}{
		{"Generic Par RGB", 4},
		{"Generic Par RGBW", 5},
		{"WLED RGB Zone", 3},
		{"WLED RGBW Zone", 4},
		{"Moving Head", 8},
		{"Strobe", 2},
	}
	for _, c := range cases {
		p := fixture.BuiltinProfiles[c.profile]
		if len(p.Channels) != c.count {
			t.Errorf("%q: got %d channels, want %d", c.profile, len(p.Channels), c.count)
		}
	}
}

func TestResolveChannels(t *testing.T) {
	// Generic Par RGB at universe 2, start_channel 5
	// color_r offset=1 → DMX channel 6 (1-indexed)
	p := fixture.BuiltinProfiles["Generic Par RGB"]
	startChannel := 5
	for _, ch := range p.Channels {
		if ch.Semantic == "color_r" {
			got := startChannel + ch.Offset
			if got != 6 {
				t.Errorf("color_r at start_channel 5: got channel %d, want 6", got)
			}
		}
	}
}
```

### Step 2: Run to verify it fails

```bash
cd server && /usr/local/go/bin/go test ./fixture/... -v
```

Expected: `cannot find package "github.com/footgunz/penumbra/fixture"`

### Step 3: Create the profiles package

```go
// server/fixture/profiles.go
package fixture

// Semantic constants for the fixed parameter superset emitted by M4L.
// These are the only parameter names the fixture system understands.
const (
	SemanticIntensity   = "intensity"
	SemanticColorR      = "color_r"
	SemanticColorG      = "color_g"
	SemanticColorB      = "color_b"
	SemanticColorW      = "color_w"
	SemanticPan         = "pan"
	SemanticTilt        = "tilt"
	SemanticGobo        = "gobo"
	SemanticStrobeRate  = "strobe_rate"
)

// AllSemantics is the full set of semantic parameters M4L may emit.
// The fixture type dropdown controls which subset is visible in the UI.
var AllSemantics = []string{
	SemanticIntensity,
	SemanticColorR,
	SemanticColorG,
	SemanticColorB,
	SemanticColorW,
	SemanticPan,
	SemanticTilt,
	SemanticGobo,
	SemanticStrobeRate,
}

// ChannelDef maps one semantic parameter to a DMX channel offset within a fixture.
// Offset is 0-indexed from start_channel: DMX channel = start_channel + Offset (1-indexed).
type ChannelDef struct {
	Semantic string
	Offset   int
}

// Profile defines the DMX channel layout for a fixture type.
type Profile struct {
	Name        string
	Description string
	Channels    []ChannelDef
}

// BuiltinProfiles is the server-side fixture library. Not user-editable.
// New fixture types are added at release time.
var BuiltinProfiles = map[string]Profile{
	"Generic Par RGB": {
		Name:        "Generic Par RGB",
		Description: "4-channel RGB par: intensity, R, G, B",
		Channels: []ChannelDef{
			{Semantic: SemanticIntensity, Offset: 0},
			{Semantic: SemanticColorR,   Offset: 1},
			{Semantic: SemanticColorG,   Offset: 2},
			{Semantic: SemanticColorB,   Offset: 3},
		},
	},
	"Generic Par RGBW": {
		Name:        "Generic Par RGBW",
		Description: "5-channel RGBW par: intensity, R, G, B, W",
		Channels: []ChannelDef{
			{Semantic: SemanticIntensity, Offset: 0},
			{Semantic: SemanticColorR,   Offset: 1},
			{Semantic: SemanticColorG,   Offset: 2},
			{Semantic: SemanticColorB,   Offset: 3},
			{Semantic: SemanticColorW,   Offset: 4},
		},
	},
	"WLED RGB Zone": {
		Name:        "WLED RGB Zone",
		Description: "3-channel RGB zone on a WLED strip: R, G, B (pixel offset × 3 = start_channel)",
		Channels: []ChannelDef{
			{Semantic: SemanticColorR, Offset: 0},
			{Semantic: SemanticColorG, Offset: 1},
			{Semantic: SemanticColorB, Offset: 2},
		},
	},
	"WLED RGBW Zone": {
		Name:        "WLED RGBW Zone",
		Description: "4-channel RGBW zone on a WLED strip: R, G, B, W",
		Channels: []ChannelDef{
			{Semantic: SemanticColorR, Offset: 0},
			{Semantic: SemanticColorG, Offset: 1},
			{Semantic: SemanticColorB, Offset: 2},
			{Semantic: SemanticColorW, Offset: 3},
		},
	},
	"Moving Head": {
		Name:        "Moving Head",
		Description: "8-channel moving head: pan, tilt, intensity, R, G, B, gobo, strobe",
		Channels: []ChannelDef{
			{Semantic: SemanticPan,        Offset: 0},
			{Semantic: SemanticTilt,       Offset: 1},
			{Semantic: SemanticIntensity,  Offset: 2},
			{Semantic: SemanticColorR,     Offset: 3},
			{Semantic: SemanticColorG,     Offset: 4},
			{Semantic: SemanticColorB,     Offset: 5},
			{Semantic: SemanticGobo,       Offset: 6},
			{Semantic: SemanticStrobeRate, Offset: 7},
		},
	},
	"Strobe": {
		Name:        "Strobe",
		Description: "2-channel strobe: intensity, strobe rate",
		Channels: []ChannelDef{
			{Semantic: SemanticIntensity,  Offset: 0},
			{Semantic: SemanticStrobeRate, Offset: 1},
		},
	},
}
```

### Step 4: Run tests

```bash
cd server && /usr/local/go/bin/go test ./fixture/... -v
```

Expected: all tests PASS

### Step 5: Commit

```bash
git add server/fixture/
git commit -m "feat(server): add fixture profiles package with 6 built-in profiles"
```

---

## Task 2: Server — add FixtureInstance to config

**Files:**
- Modify: `server/config/config.go`
- Create: `server/config/config_test.go`

### Step 1: Write the failing test

```go
// server/config/config_test.go
package config_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/footgunz/penumbra/config"
)

func TestLoadFixtures(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	raw := `{
		"universes": {"1": {"device_ip": "192.168.1.1", "label": "test"}},
		"fixtures": {
			"stage_left": {"profile": "Generic Par RGB", "universe": 1, "start_channel": 1}
		}
	}`
	os.WriteFile(path, []byte(raw), 0o644)

	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	fi, ok := cfg.Fixtures["stage_left"]
	if !ok {
		t.Fatal("expected fixture 'stage_left'")
	}
	if fi.Profile != "Generic Par RGB" {
		t.Errorf("profile: got %q, want %q", fi.Profile, "Generic Par RGB")
	}
	if fi.Universe != 1 {
		t.Errorf("universe: got %d, want 1", fi.Universe)
	}
	if fi.StartChannel != 1 {
		t.Errorf("start_channel: got %d, want 1", fi.StartChannel)
	}
}

func TestLoadBackwardCompat(t *testing.T) {
	// Old config without fixtures field should still load cleanly.
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	raw := `{
		"universes": {"1": {"device_ip": "192.168.1.1", "label": "test"}},
		"parameters": {
			"track1_dimmer": [{"universe": 1, "channel": 1}]
		}
	}`
	os.WriteFile(path, []byte(raw), 0o644)

	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(cfg.Parameters) == 0 {
		t.Error("expected parameters to be loaded")
	}
	if cfg.Fixtures == nil {
		t.Error("expected Fixtures to be initialised (empty map, not nil)")
	}
}

func TestSaveRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")

	cfg, _ := config.Load(path) // empty config
	cfg.Fixtures["stage_left"] = config.FixtureInstance{
		Profile:      "Generic Par RGB",
		Universe:     2,
		StartChannel: 5,
	}
	if err := cfg.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	data, _ := os.ReadFile(path)
	var raw map[string]json.RawMessage
	json.Unmarshal(data, &raw)
	if _, ok := raw["fixtures"]; !ok {
		t.Error("saved JSON missing 'fixtures' key")
	}
}
```

### Step 2: Run to verify it fails

```bash
cd server && /usr/local/go/bin/go test ./config/... -v
```

Expected: FAIL — `cfg.Fixtures` undefined

### Step 3: Add FixtureInstance to config.go

Add the following to `server/config/config.go` after the existing types:

```go
// FixtureInstance is a patched fixture: a named instance of a profile
// at a specific universe and start channel.
// The fixture name (map key) is also the prefix used in M4L parameter names:
// a fixture named "stage_left" expects state keys "stage_left_color_r", etc.
type FixtureInstance struct {
	Profile      string `json:"profile"`       // must match a key in fixture.BuiltinProfiles
	Universe     int    `json:"universe"`      // universe number
	StartChannel int    `json:"start_channel"` // 1-indexed DMX start channel
}
```

And update the `Config` struct to add `Fixtures`:

```go
type Config struct {
	Universes  map[int]UniverseConfig       `json:"universes"`
	Fixtures   map[string]FixtureInstance   `json:"fixtures"`
	Parameters map[string]ParameterConfig   `json:"parameters"`
	path       string
}
```

And update `Load` to initialise `Fixtures`:

```go
cfg := &Config{
	Universes:  make(map[int]UniverseConfig),
	Fixtures:   make(map[string]FixtureInstance),
	Parameters: make(map[string]ParameterConfig),
	path:       path,
}
```

### Step 4: Run tests

```bash
cd server && /usr/local/go/bin/go test ./config/... -v
```

Expected: all tests PASS

### Step 5: Commit

```bash
git add server/config/config.go server/config/config_test.go
git commit -m "feat(server): add FixtureInstance to Config; keep Parameters for backward compat"
```

---

## Task 3: Server — E1.31 dispatcher resolves fixture instances

**Files:**
- Modify: `server/e131/e131.go`
- Create: `server/e131/e131_test.go`

### Step 1: Write the failing test

```go
// server/e131/e131_test.go
package e131_test

import (
	"testing"

	"github.com/footgunz/penumbra/config"
	"github.com/footgunz/penumbra/e131"
)

func TestDispatchFixture_WritesCorrectChannel(t *testing.T) {
	cfg := &config.Config{
		Universes: map[int]config.UniverseConfig{
			1: {DeviceIP: "239.255.0.1", Label: "test"},
		},
		Fixtures: map[string]config.FixtureInstance{
			"stage_left": {
				Profile:      "Generic Par RGB",
				Universe:     1,
				StartChannel: 1,
			},
		},
		Parameters: map[string]config.ParameterConfig{},
	}

	// Capture DMX output for inspection.
	var captured []capturedPacket
	d := e131.NewTestDispatcher(func(universe int, dmx []byte) {
		captured = append(captured, capturedPacket{universe, append([]byte{}, dmx...)})
	})

	state := map[string]float64{
		"stage_left_color_r": 1.0, // → DMX 255 at channel 2 (offset 1, start 1)
		"stage_left_color_g": 0.5, // → DMX 128 at channel 3
		"stage_left_intensity": 0.0, // → DMX 0 at channel 1
	}

	d.Dispatch(state, cfg)

	if len(captured) != 1 {
		t.Fatalf("expected 1 universe packet, got %d", len(captured))
	}
	pkt := captured[0]
	if pkt.universe != 1 {
		t.Errorf("universe: got %d, want 1", pkt.universe)
	}
	// channel 1 = index 0: intensity = 0.0 → 0
	if pkt.dmx[0] != 0 {
		t.Errorf("ch1 (intensity): got %d, want 0", pkt.dmx[0])
	}
	// channel 2 = index 1: color_r = 1.0 → 255
	if pkt.dmx[1] != 255 {
		t.Errorf("ch2 (color_r): got %d, want 255", pkt.dmx[1])
	}
	// channel 3 = index 2: color_g = 0.5 → 128 (rounded)
	if pkt.dmx[2] != 128 {
		t.Errorf("ch3 (color_g): got %d, want 128", pkt.dmx[2])
	}
}

func TestDispatchFixture_IgnoresUnknownProfile(t *testing.T) {
	cfg := &config.Config{
		Universes:  map[int]config.UniverseConfig{1: {}},
		Fixtures:   map[string]config.FixtureInstance{
			"mystery": {Profile: "Nonexistent Profile", Universe: 1, StartChannel: 1},
		},
		Parameters: map[string]config.ParameterConfig{},
	}
	d := e131.NewTestDispatcher(func(_ int, _ []byte) {
		// should not be called — unknown profile means no channels, no output
	})
	// Should not panic
	d.Dispatch(map[string]float64{"mystery_intensity": 1.0}, cfg)
}

func TestDispatchLegacyParameters(t *testing.T) {
	// Old parameters field still works.
	cfg := &config.Config{
		Universes: map[int]config.UniverseConfig{1: {}},
		Fixtures:  map[string]config.FixtureInstance{},
		Parameters: map[string]config.ParameterConfig{
			"track1_dimmer": {{Universe: 1, Channel: 1}},
		},
	}
	var captured []capturedPacket
	d := e131.NewTestDispatcher(func(universe int, dmx []byte) {
		captured = append(captured, capturedPacket{universe, append([]byte{}, dmx...)})
	})
	d.Dispatch(map[string]float64{"track1_dimmer": 1.0}, cfg)
	if len(captured) != 1 {
		t.Fatalf("expected 1 packet, got %d", len(captured))
	}
	if captured[0].dmx[0] != 255 {
		t.Errorf("ch1: got %d, want 255", captured[0].dmx[0])
	}
}

type capturedPacket struct {
	universe int
	dmx      []byte
}
```

### Step 2: Run to verify it fails

```bash
cd server && /usr/local/go/bin/go test ./e131/... -v
```

Expected: FAIL — `NewTestDispatcher` undefined

### Step 3: Update e131.go

The `Dispatch` method needs to handle both fixture instances and legacy parameters. Also expose a `NewTestDispatcher` constructor that accepts an inject-able send function for testing.

Replace the `Dispatcher` struct and add the new dispatch logic in `server/e131/e131.go`:

```go
// SendFn is the function called to transmit a built E1.31 packet.
// Replaced in tests to capture output without UDP sockets.
type SendFn func(addr string, pkt []byte)

// Dispatcher sends E1.31 packets.
type Dispatcher struct {
	sequences map[int]uint8
	cid       [16]byte
	sendFn    SendFn
}

// NewDispatcher creates a Dispatcher that sends real UDP packets.
func NewDispatcher(cfg *config.Config) *Dispatcher {
	return &Dispatcher{
		sequences: make(map[int]uint8),
		cid:       generateCID(),
		sendFn:    sendUDP,
	}
}

// NewTestDispatcher creates a Dispatcher that calls onPacket instead of sending UDP.
// onPacket receives the universe number and the 512-byte DMX slot array.
func NewTestDispatcher(onPacket func(universe int, dmx []byte)) *Dispatcher {
	return &Dispatcher{
		sequences: make(map[int]uint8),
		cid:       generateCID(),
		sendFn: func(addr string, pkt []byte) {
			// Extract universe and DMX data from the built packet.
			// Universe is at bytes 113-114 (big-endian uint16).
			// DMX starts at byte 125 (after start code at 124).
			universe := int(pkt[113])<<8 | int(pkt[114])
			dmx := pkt[125 : 125+UniverseSize]
			onPacket(universe, dmx)
		},
	}
}
```

Replace the `Dispatch` method:

```go
// Dispatch resolves fixture instances and legacy parameters from state,
// builds per-universe DMX arrays, and sends E1.31 packets.
func (d *Dispatcher) Dispatch(state map[string]float64, cfg *config.Config) {
	universes := make(map[int][]byte)

	ensure := func(u int) {
		if _, ok := universes[u]; !ok {
			universes[u] = make([]byte, UniverseSize)
		}
	}

	write := func(universe, channel int, value float64) {
		ensure(universe)
		ch := channel - 1 // 1-indexed → 0-indexed
		if ch >= 0 && ch < UniverseSize {
			universes[universe][ch] = floatToDMX(value)
		}
	}

	// Fixture instances: look up each fixture's profile and resolve channels.
	for fixtureName, instance := range cfg.Fixtures {
		profile, ok := fixture.BuiltinProfiles[instance.Profile]
		if !ok {
			continue // unknown profile — silently skip
		}
		for _, ch := range profile.Channels {
			key := fixtureName + "_" + ch.Semantic
			value, ok := state[key]
			if !ok {
				continue
			}
			dmxChannel := instance.StartChannel + ch.Offset // 1-indexed
			write(instance.Universe, dmxChannel, value)
		}
	}

	// Legacy parameters: direct parameter → channel mapping.
	for paramName, value := range state {
		targets, ok := cfg.Parameters[paramName]
		if !ok {
			continue
		}
		for _, t := range targets {
			write(t.Universe, t.Channel, value)
		}
	}

	for universe, dmx := range universes {
		seq := d.nextSeq(universe)
		pkt := buildPacket(universe, dmx, seq, d.cid, "penumbra")
		addr := universeMulticastAddr(universe)
		d.sendFn(addr, pkt)
	}
}
```

Add the import for the fixture package at the top:
```go
import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"math"
	"net"

	"github.com/footgunz/penumbra/config"
	"github.com/footgunz/penumbra/fixture"
)
```

Replace the old `send` method with the standalone `sendUDP` function:
```go
func sendUDP(addr string, pkt []byte) {
	udpAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", addr, Port))
	if err != nil {
		return
	}
	conn, err := net.DialUDP("udp", nil, udpAddr)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.Write(pkt)
}
```

### Step 4: Run tests

```bash
cd server && /usr/local/go/bin/go test ./e131/... ./fixture/... ./config/... -v
```

Expected: all tests PASS

### Step 5: Verify the server still builds

```bash
cd server && /usr/local/go/bin/go build .
```

Expected: no errors

### Step 6: Commit

```bash
git add server/e131/ server/fixture/
git commit -m "feat(server): E1.31 dispatcher resolves fixture instances via profile channel offsets"
```

---

## Task 4: Server — GET /api/fixtures endpoint

Exposes the built-in profile list to the UI so it can populate the fixture editor.

**Files:**
- Modify: `server/api/routes.go`

### Step 1: Add the route

In `NewRouter`, add a new handler before the file server catch-all:

```go
// GET /api/fixtures — return built-in fixture profiles
mux.HandleFunc("/api/fixtures", func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
        http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
        return
    }
    type profileSummary struct {
        Name        string   `json:"name"`
        Description string   `json:"description"`
        Semantics   []string `json:"semantics"`
    }
    profiles := make([]profileSummary, 0, len(fixture.BuiltinProfiles))
    for _, p := range fixture.BuiltinProfiles {
        semantics := make([]string, len(p.Channels))
        for i, ch := range p.Channels {
            semantics[i] = ch.Semantic
        }
        profiles = append(profiles, profileSummary{
            Name:        p.Name,
            Description: p.Description,
            Semantics:   semantics,
        })
    }
    data, _ := json.Marshal(profiles)
    w.Header().Set("Content-Type", "application/json")
    w.Write(data)
})
```

Add `fixture` to the import block:
```go
import (
    "encoding/json"
    "fmt"
    "io"
    "io/fs"
    "log"
    "net/http"

    "github.com/footgunz/penumbra/config"
    "github.com/footgunz/penumbra/fixture"
    "github.com/footgunz/penumbra/ui"
    "github.com/footgunz/penumbra/ws"
)
```

Also update the `POST /api/config` handler to accept the `fixtures` field:

```go
var update struct {
    Universes  map[int]config.UniverseConfig       `json:"universes"`
    Fixtures   map[string]config.FixtureInstance   `json:"fixtures"`
    Parameters map[string]config.ParameterConfig   `json:"parameters"`
}
// ...after unmarshal:
if update.Fixtures != nil {
    cfg.Fixtures = update.Fixtures
}
```

### Step 2: Build and verify

```bash
cd server && /usr/local/go/bin/go build .
```

Expected: no errors

### Step 3: Smoke test the endpoint

```bash
# Start server in background
cd server && /usr/local/go/bin/go run . &
sleep 1
curl -s http://localhost:3000/api/fixtures | head -c 200
kill %1
```

Expected: JSON array of profile objects with name, description, semantics.

### Step 4: Commit

```bash
git add server/api/routes.go
git commit -m "feat(server): add GET /api/fixtures endpoint; POST /api/config accepts fixtures field"
```

---

## Task 5: Update config.json with fixture instances

Update the committed `server/config.json` to demonstrate the new schema. Keep the existing `parameters` entries for backward compatibility with the fake emitter.

**Files:**
- Modify: `server/config.json`

### Step 1: Update config.json

```json
{
  "universes": {
    "1": {
      "device_ip": "192.168.1.101",
      "label": "stage left"
    },
    "2": {
      "device_ip": "192.168.1.102",
      "label": "stage right"
    }
  },
  "fixtures": {
    "track1": {
      "profile": "Generic Par RGBW",
      "universe": 1,
      "start_channel": 1
    },
    "track2": {
      "profile": "Generic Par RGBW",
      "universe": 1,
      "start_channel": 6
    }
  },
  "parameters": {
    "track1_blue": [
      { "universe": 1, "channel": 4 },
      { "universe": 2, "channel": 120 }
    ],
    "track1_dimmer": [{ "universe": 1, "channel": 1 }],
    "track1_green":  [{ "universe": 1, "channel": 3 }],
    "track1_red":    [{ "universe": 1, "channel": 2 }]
  }
}
```

### Step 2: Verify server loads it

```bash
cd server && /usr/local/go/bin/go run . &
sleep 1
curl -s http://localhost:3000/api/config | python3 -m json.tool | grep -A5 '"fixtures"'
kill %1
```

Expected: fixtures block present with track1 and track2 instances.

### Step 3: Commit

```bash
git add server/config.json
git commit -m "chore(server): add fixture instances to config.json example"
```

---

## Task 6: Fake emitter — emit fixture-style parameters

Update the fake emitter to emit semantic parameter names (`track1_color_r`, `track1_intensity`) alongside the legacy names, so it exercises the new fixture dispatch path.

**Files:**
- Modify: `tools/fake-emitter/main.go`

### Step 1: Add fixture parameters to defaultParameters

In `main.go`, replace `defaultParameters` with a fixture-aware set:

```go
// defaultParameters covers both legacy names (for backward compat with
// direct parameter config) and fixture-style semantic names (for the new
// fixture instance model). The fixture names here match the instances in
// server/config.json.
var defaultParameters = []string{
	// Fixture-style: semantic params prefixed with fixture name
	"track1_intensity", "track1_color_r", "track1_color_g", "track1_color_b", "track1_color_w",
	"track2_intensity", "track2_color_r", "track2_color_g", "track2_color_b", "track2_color_w",
	// Legacy flat params kept for backward compat
	"track1_dimmer", "track1_red", "track1_green", "track1_blue",
	"master_dimmer",
}
```

### Step 2: Build and verify

```bash
cd tools/fake-emitter && /usr/local/go/bin/go build .
```

Expected: no errors

### Step 3: Commit

```bash
git add tools/fake-emitter/main.go
git commit -m "feat(fake-emitter): emit fixture-style semantic parameters alongside legacy names"
```

---

## Task 7: M4L device — per-fixture emitter TypeScript

This rewrites the M4L device from a "LOM crawler for all tracks" to a "per-fixture instrument on one track." The Max patch UI changes (dials, dropdown, wiring) require manual work in the Max editor and are described in the notes — this task covers the TypeScript layer.

**Files:**
- Modify: `device/scripts/src/lib/emitter.ts`
- Modify: `device/scripts/src/main.ts`
- Modify: `device/scripts/src/lib/emitter.test.ts` (if exists, otherwise create)

### Step 1: Update emitter.ts

The emitter now takes a fixture name prefix and emits `{fixtureName}_{semantic}` keys:

```typescript
// lib/emitter.ts
import { encode } from '@msgpack/msgpack'

type SendFn = (bytes: number[]) => void

interface State {
  session_id: string
  fixture_name: string
  params: Record<string, number>
}

function generateSessionId(): string {
  var s = ''
  for (var i = 0; i < 32; i++) {
    var r = Math.floor(Math.random() * 16)
    if (i === 8 || i === 12 || i === 16 || i === 20) s += '-'
    if (i === 12) {
      s += '4'
    } else if (i === 16) {
      s += (r & 0x3 | 0x8).toString(16)
    } else {
      s += r.toString(16)
    }
  }
  return s
}

export function createEmitter(send: SendFn) {
  var state: State = {
    session_id: generateSessionId(),
    fixture_name: 'fixture',
    params: {},
  }

  return {
    setFixtureName: function(name: string): void {
      state.fixture_name = name
    },

    setParam: function(semantic: string, value: number): void {
      state.params[semantic] = value
    },

    resetSession: function(): void {
      state.session_id = generateSessionId()
      state.params = {}
    },

    emit: function(): void {
      // Build prefixed state: { stage_left_color_r: 0.8, ... }
      var prefixed: Record<string, number> = {}
      var prefix = state.fixture_name + '_'
      for (var k in state.params) {
        prefixed[prefix + k] = state.params[k]
      }
      var pkt = {
        session_id: state.session_id,
        ts: Date.now(),
        state: prefixed,
      }
      var encoded = encode(pkt)
      var bytes: number[] = []
      for (var i = 0; i < encoded.length; i++) {
        bytes[i] = encoded[i]
      }
      send(bytes)
    },
  }
}
```

### Step 2: Update emitter.test.ts

```typescript
// lib/emitter.test.ts
import { createEmitter } from './emitter'
import { decode } from '@msgpack/msgpack'

describe('createEmitter', () => {
  it('calls send with a non-empty byte array on emit', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.emit()
    expect(sent.length).toBe(1)
    expect(sent[0].length).toBeGreaterThan(0)
  })

  it('prefixes params with fixture name', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.setFixtureName('stage_left')
    e.setParam('color_r', 0.8)
    e.emit()

    const pkt = decode(new Uint8Array(sent[0])) as any
    expect(pkt.state['stage_left_color_r']).toBeCloseTo(0.8)
    expect(pkt.state['color_r']).toBeUndefined()
  })

  it('uses default fixture name if setFixtureName not called', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.setParam('intensity', 1.0)
    e.emit()

    const pkt = decode(new Uint8Array(sent[0])) as any
    // default name is 'fixture'
    expect(pkt.state['fixture_intensity']).toBe(1.0)
  })

  it('includes setParam values in emitted packet', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.setFixtureName('test')
    e.setParam('color_g', 0.5)
    e.setParam('intensity', 1.0)
    e.emit()

    const pkt = decode(new Uint8Array(sent[0])) as any
    expect(pkt.state['test_color_g']).toBeCloseTo(0.5)
    expect(pkt.state['test_intensity']).toBe(1.0)
  })

  it('resetSession changes the session id', () => {
    const sent: number[][] = []
    const e = createEmitter((b) => sent.push(b))
    e.emit()
    const id1 = (decode(new Uint8Array(sent[0])) as any).session_id
    e.resetSession()
    e.emit()
    const id2 = (decode(new Uint8Array(sent[1])) as any).session_id
    expect(id1).not.toBe(id2)
  })
})
```

### Step 3: Update main.ts

The new main.ts reads the track name from the LOM, sets it as the fixture name, and receives parameter values from the Max patch via function calls (wired in `Penumbra.maxpat`). The LOM crawler is removed.

```typescript
// main.ts — per-fixture M4L emitter.
//
// This device lives on ONE track and emits that track's lighting parameters.
// The track name becomes the fixture name prefix (e.g., "stage_left").
// Parameter values are set by live.dial objects in the Max patch calling
// setColorR(), setColorG(), etc.
//
// The Max patch must wire each live.dial outlet to the corresponding
// js function call: [js penumbra] receives messages like "setColorR 0.8".

declare var Task: new (fn: () => void) => {
  interval: number
  delay: number
  start(): void
}
declare var LiveAPI: new (callback: ((args: string[]) => void) | null, path: string) => {
  path: string
  id: string
  get(prop: string): unknown[]
  getcount(prop: string): number
  goto(path: string): void
}
declare function outlet(n: number, ...args: unknown[]): void
declare function post(...args: unknown[]): void

import { createEmitter } from './lib/emitter'

function udpSend(bytes: number[]): void {
  outlet(0, bytes)
}

var emitter = createEmitter(udpSend)

// ─── Track name → fixture name ────────────────────────────────────────────────

function getFixtureName(): string {
  try {
    var track = new LiveAPI(null, 'this_device canonical_parent')
    var rawName = track.get('name')[0] as string
    return rawName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
  } catch (e) {
    return 'fixture'
  }
}

// ─── Track-change observer ────────────────────────────────────────────────────

var liveSet = new LiveAPI(function(args) {
  if (args[0] === 'tracks') {
    emitter.resetSession()
    emitter.setFixtureName(getFixtureName())
    post('Penumbra: track change — session reset\n')
  }
}, 'live_set')

// ─── Parameter setters — called by Max patch dials ───────────────────────────
// Each function is invoked by a [js] message in the Max patch:
//   e.g., a live.dial for color_r sends "setColorR <value>" to the js object.

function setIntensity(v: number):  void { emitter.setParam('intensity',   v) }
function setColorR(v: number):     void { emitter.setParam('color_r',     v) }
function setColorG(v: number):     void { emitter.setParam('color_g',     v) }
function setColorB(v: number):     void { emitter.setParam('color_b',     v) }
function setColorW(v: number):     void { emitter.setParam('color_w',     v) }
function setPan(v: number):        void { emitter.setParam('pan',         v) }
function setTilt(v: number):       void { emitter.setParam('tilt',        v) }
function setGobo(v: number):       void { emitter.setParam('gobo',        v) }
function setStrobeRate(v: number): void { emitter.setParam('strobe_rate', v) }

// ─── Emit task ────────────────────────────────────────────────────────────────

var emitTask = new Task(function() {
  emitter.setFixtureName(getFixtureName())
  emitter.emit()
})
emitTask.interval = 40
emitTask.start()

post('Penumbra fixture emitter started\n')
```

**Note on Max patch changes (manual, not in this plan):**
The `device/Penumbra.maxpat` needs updating in the Max editor:
1. Remove the lomTask wiring (no more LOM crawler)
2. Add `live.dial` objects for each semantic parameter (intensity, color_r, color_g, color_b, color_w, pan, tilt, gobo, strobe_rate)
3. Each dial sends a message to the `[js penumbra]` object: e.g. `[prepend setColorR]` → `[js penumbra]`
4. Add a fixture type message box or `live.menu` to control which dials are visible (cosmetic only — all params are always emitted)
5. The udpsend wiring on outlet 0 stays unchanged

### Step 4: Run TS tests

```bash
pnpm --filter device-scripts test
```

Expected: all tests PASS (including the updated emitter tests)

### Step 5: Build

```bash
pnpm --filter device-scripts build
```

Expected: `device/scripts/dist/main.js` rebuilt, no errors

### Step 6: Commit

```bash
git add device/scripts/src/
git commit -m "feat(m4l): rewrite emitter as per-fixture instrument; emit fixture-prefixed semantic params"
```

---

## Task 8: Update docs/config.md

**Files:**
- Modify: `docs/config.md` (note: this file may not exist in this worktree if PR #35 hasn't merged — if so, skip and note in PR description)

Check if the file exists first:

```bash
ls docs/config.md 2>/dev/null && echo "exists" || echo "missing — skip this task"
```

If it exists, add a `fixtures` section documenting the new schema after the `parameters` section. Document `FixtureInstance` fields (profile, universe, start_channel) and list the built-in profile names.

If it doesn't exist (PR #35 not yet merged), note in the PR description that `docs/config.md` will need updating once #35 merges.

---

## Task 9: Open draft PR

```bash
git push -u origin feat/fixture-library
gh pr create \
  --title "feat: fixture library, semantic M4L parameter model" \
  --draft \
  --body "Closes #36

## What this implements
- \`server/fixture/\` — built-in profile library (6 profiles: Generic Par RGB/W, WLED RGB/W Zone, Moving Head, Strobe)
- \`config.Config.Fixtures\` — fixture instances map; \`parameters\` kept for backward compat
- E1.31 dispatcher resolves fixture instances via profile channel offsets
- \`GET /api/fixtures\` — exposes built-in profiles to UI
- Fake emitter updated to emit fixture-style semantic parameters
- M4L device rewritten as per-fixture instrument (one device per track, emits \`{fixture_name}_{semantic}\`)

## Not yet done
- Max patch UI changes (live.dial wiring, fixture type dropdown) — requires manual work in Max editor
- Server UI fixture instance editor (blocked on UI work in separate issues)
- \`docs/config.md\` fixture schema section (pending PR #35 merge)
"
```
