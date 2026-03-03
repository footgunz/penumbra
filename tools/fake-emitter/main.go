// tools/fake-emitter/main.go
//
// Fake M4L emitter for development without Ableton Live.
// Sends identical UDP MessagePack packets to the Go server at 40ms intervals.
// The server cannot distinguish this from the real M4L device.
//
// Usage:
//   go run . --mode static                  # fixed values
//   go run . --mode animated                # independent random walks per parameter
//   go run . --mode stress                  # fast sine sweeps for load testing
//   go run . --mode scripted --scene scenes/example.json  # replay JSON scene (future)
//   go run . --target 192.168.1.50:7000     # target a remote server

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gofrs/flock"
	"github.com/vmihailenco/msgpack/v5"
)

type StatePacket struct {
	SessionID string             `msgpack:"session_id"`
	Ts        int64              `msgpack:"ts"`
	State     map[string]float64 `msgpack:"state"`
}

// Fixtures mirror the M4L preset library in device/scripts/src/main.ts.
// Names use the same wire format as the real device: {fixture}_{Label}
// where fixture is a lowercase track name and Label is Title Case.

type fixture struct {
	name   string   // simulated track name (lowercase, underscores)
	labels []string // Title Case labels from the M4L preset library
}

var fixtures = []fixture{
	{
		name:   "par_front",
		labels: []string{"Dimmer", "Red", "Green", "Blue", "Strobe", "Mode"},
	},
	{
		name:   "mover_back",
		labels: []string{"Pan", "Tilt", "Dimmer", "Color", "Gobo", "Speed"},
	},
}

// allParameters is the flattened list of "{fixture}_{Label}" keys.
var allParameters []string

func init() {
	for _, f := range fixtures {
		for _, l := range f.labels {
			allParameters = append(allParameters, f.name+"_"+l)
		}
	}
}

// ── Animated mode: independent random walk per parameter ──────────────────
//
// Each parameter moves linearly toward a randomly chosen target. When it
// arrives it picks a new target that is at least minSwing away, guaranteeing
// every sweep is visibly large. Speed varies per parameter so they never
// converge or synchronise. No sine waves — no periodic convergence to 0.5.

const (
	minSwing = 0.35 // minimum distance between consecutive targets
	minSpeed = 0.08 // units/s — full range in ~12.5s
	maxSpeed = 0.20 // units/s — full range in ~5s
)

type animParam struct {
	value  float64
	target float64
	speed  float64 // units per second
}

func newAnimParam(r *rand.Rand) animParam {
	value := r.Float64()
	return animParam{
		value:  value,
		target: pickTarget(value, r),
		speed:  minSpeed + r.Float64()*(maxSpeed-minSpeed),
	}
}

// pickTarget returns a random value at least minSwing away from current.
func pickTarget(current float64, r *rand.Rand) float64 {
	for {
		t := r.Float64()
		if math.Abs(t-current) >= minSwing {
			return t
		}
	}
}

// advance moves the parameter one 40ms tick toward its target.
// Returns the current value after the move.
func (p *animParam) advance(r *rand.Rand) float64 {
	const dt = 0.04
	diff := p.target - p.value
	step := p.speed * dt
	if math.Abs(diff) <= step {
		p.value = p.target
		p.target = pickTarget(p.value, r)
	} else if diff > 0 {
		p.value += step
	} else {
		p.value -= step
	}
	return p.value
}

// ── Single-instance lock ───────────────────────────────────────────────────
//
// acquireLock uses gofrs/flock for cross-platform exclusive file locking
// (flock(2) on Unix, LockFileEx on Windows). The lock is released automatically
// when the process exits, so no cleanup is needed even on a crash.

func acquireLock() *flock.Flock {
	path := filepath.Join(os.TempDir(), "penumbra-fake-emitter.lock")
	fl := flock.New(path)
	locked, err := fl.TryLock()
	if err != nil {
		log.Fatalf("cannot acquire lock file: %v", err)
	}
	if !locked {
		log.Fatal("another fake emitter instance is already running — kill it first")
	}
	return fl
}

// ─────────────────────────────────────────────────────────────────────────────

var (
	animRand   *rand.Rand
	animParams map[string]*animParam
)

func initAnimated() {
	animRand = rand.New(rand.NewSource(time.Now().UnixNano()))
	animParams = make(map[string]*animParam, len(allParameters))
	for _, p := range allParameters {
		ap := newAnimParam(animRand)
		animParams[p] = &ap
	}
}

// ─────────────────────────────────────────────────────────────────────────────

func main() {
	mode := flag.String("mode", "animated", "Emitter mode: static | animated | stress")
	target := flag.String("target", "localhost:7000", "Server UDP address")
	sessionID := flag.String("session", "", "Session ID (default: generated from timestamp)")
	noLock := flag.Bool("no-lock", false, "Skip single-instance lock (for testing/debug)")
	flag.Parse()

	if !*noLock {
		lock := acquireLock()
		defer lock.Unlock()
	}

	if *sessionID == "" {
		*sessionID = fmt.Sprintf("fake-%d", time.Now().UnixMilli())
	}

	if *mode == "animated" {
		initAnimated()
	}

	addr, err := net.ResolveUDPAddr("udp", *target)
	if err != nil {
		log.Fatalf("invalid target address: %v", err)
	}

	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		log.Fatalf("failed to open UDP connection: %v", err)
	}
	defer conn.Close()

	log.Printf("Fake emitter running — mode=%s target=%s session=%s", *mode, *target, *sessionID)
	log.Printf("Parameters: %v", allParameters)
	log.Printf("Press Ctrl+C to stop")

	ticker := time.NewTicker(40 * time.Millisecond)
	defer ticker.Stop()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)

	start := time.Now()

	for {
		select {
		case <-sig:
			log.Println("Stopping.")
			return
		case t := <-ticker.C:
			elapsed := t.Sub(start).Seconds()
			state := buildState(*mode, elapsed)
			pkt := StatePacket{
				SessionID: *sessionID,
				Ts:        t.UnixMilli(),
				State:     state,
			}
			data, err := msgpack.Marshal(pkt)
			if err != nil {
				log.Printf("marshal error: %v", err)
				continue
			}
			if _, err := conn.Write(data); err != nil {
				log.Printf("send error: %v", err)
			}
		}
	}
}

func buildState(mode string, elapsed float64) map[string]float64 {
	state := make(map[string]float64, len(allParameters))

	switch mode {
	case "static":
		// Fixed mid-value for all parameters — good for plumbing tests.
		for _, p := range allParameters {
			state[p] = 0.5
		}

	case "animated":
		// Independent random walk: each parameter moves toward its own target
		// and picks a new one on arrival. No periodicity, no convergence to 0.5.
		for _, p := range allParameters {
			state[p] = animParams[p].advance(animRand)
		}

	case "stress":
		// Fast sine sweeps for load/hardware testing.
		for i, p := range allParameters {
			phase := float64(i) * (math.Pi / float64(len(allParameters)))
			rate := 0.2 + float64(i)*0.05
			state[p] = (math.Sin(elapsed*rate+phase) + 1) / 2
		}
	}

	return state
}

// Scene represents a scripted sequence of states (future JSON replay mode).
// Defined here so the structure is established even before the feature is built.
type Scene struct {
	Name   string       `json:"name"`
	Frames []SceneFrame `json:"frames"`
}

type SceneFrame struct {
	OffsetMs int64              `json:"offset_ms"`
	State    map[string]float64 `json:"state"`
}

func loadScene(path string) (*Scene, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var scene Scene
	if err := json.Unmarshal(data, &scene); err != nil {
		return nil, err
	}
	return &scene, nil
}
