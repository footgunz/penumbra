// tools/fake-emitter/main.go
//
// Fake M4L emitter for development without Ableton Live.
// Sends identical UDP MessagePack packets to the Go server at 40ms intervals.
// The server cannot distinguish this from the real M4L device.
//
// Usage:
//   go run . --mode static                  # fixed values
//   go run . --mode animated                # sweeps values over time
//   go run . --mode scripted --scene scenes/example.json  # replay JSON scene (future)
//   go run . --target 192.168.1.50:7000     # target a remote server

package main

import (
	"encoding/json"
	"flag"
	"log"
	"math"
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

func main() {
	mode := flag.String("mode", "animated", "Emitter mode: static | animated")
	target := flag.String("target", "localhost:7000", "Server UDP address")
	sessionID := flag.String("session", "fake-session-001", "Session ID")
	flag.Parse()

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
		// Fixed mid-value for all parameters — good for plumbing tests
		for _, p := range defaultParameters {
			state[p] = 0.5
		}

	case "animated":
		// Each parameter sweeps at a slightly different rate
		// Produces visible, varied output on real hardware
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
	Name   string        `json:"name"`
	Frames []SceneFrame  `json:"frames"`
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
