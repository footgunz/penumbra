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
	"syscall"
	"time"

	"github.com/vmihailenco/msgpack/v5"
)

type StatePacket struct {
	SessionID string             `msgpack:"session_id"`
	Ts        int64              `msgpack:"ts"`
	State     map[string]float64 `msgpack:"state"`
}

// defaultParameters defines a representative parameter set.
// Mirrors what a typical Live session might expose.
// Replace or extend as your session grows.
var defaultParameters = []string{
	"track1_dimmer", "track1_red", "track1_green", "track1_blue",
	"track2_dimmer", "track2_red", "track2_green", "track2_blue",
	"track3_dimmer", "track3_red", "track3_green", "track3_blue",
	"track4_dimmer", "track4_red", "track4_green", "track4_blue",
	"master_dimmer",
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
// acquireLock opens a well-known lock file and acquires an exclusive,
// non-blocking flock on it. The OS releases the lock automatically when the
// process exits, so no cleanup is needed even on a crash.

const lockFile = "/tmp/penumbra-fake-emitter.lock"

func acquireLock() *os.File {
	f, err := os.OpenFile(lockFile, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		log.Fatalf("cannot open lock file: %v", err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		log.Fatal("another fake emitter instance is already running — kill it first")
	}
	return f
}

// ─────────────────────────────────────────────────────────────────────────────

var (
	animRand   *rand.Rand
	animParams map[string]*animParam
)

func initAnimated() {
	animRand = rand.New(rand.NewSource(time.Now().UnixNano()))
	animParams = make(map[string]*animParam, len(defaultParameters))
	for _, p := range defaultParameters {
		ap := newAnimParam(animRand)
		animParams[p] = &ap
	}
}

// ─────────────────────────────────────────────────────────────────────────────

func main() {
	lock := acquireLock()
	defer lock.Close()

	mode := flag.String("mode", "animated", "Emitter mode: static | animated | stress")
	target := flag.String("target", "localhost:7000", "Server UDP address")
	sessionID := flag.String("session", "", "Session ID (default: generated from timestamp)")
	flag.Parse()

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
	log.Printf("Parameters: %v", defaultParameters)
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
	state := make(map[string]float64, len(defaultParameters))

	switch mode {
	case "static":
		// Fixed mid-value for all parameters — good for plumbing tests.
		for _, p := range defaultParameters {
			state[p] = 0.5
		}

	case "animated":
		// Independent random walk: each parameter moves toward its own target
		// and picks a new one on arrival. No periodicity, no convergence to 0.5.
		for _, p := range defaultParameters {
			state[p] = animParams[p].advance(animRand)
		}

	case "stress":
		// Fast sine sweeps for load/hardware testing.
		for i, p := range defaultParameters {
			phase := float64(i) * (math.Pi / float64(len(defaultParameters)))
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
