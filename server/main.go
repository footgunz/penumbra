package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/footgunz/penumbra/api"
	"github.com/footgunz/penumbra/config"
	"github.com/footgunz/penumbra/e131"
	"github.com/footgunz/penumbra/state"
	"github.com/footgunz/penumbra/tui"
	"github.com/footgunz/penumbra/udp"
	"github.com/footgunz/penumbra/wled"
	"github.com/footgunz/penumbra/ws"
)

func main() {
	tuiFlag := flag.Bool("tui", false, "Enable terminal UI dashboard")
	flag.Parse()

	tuiMode := *tuiFlag || os.Getenv("TUI") == "1"

	udpPort := envInt("UDP_PORT", 7000)
	wsPort := envInt("WS_PORT", 3000)

	cfg, err := config.Load("config.json")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	hub := ws.NewHub(cfg)
	go hub.Run()

	// Create TUI program early so goroutine callbacks can reference it.
	var program *tea.Program
	if tuiMode {
		m := tui.New(tui.BlackoutFuncs{
			IsActive: hub.IsBlackout,
			Trigger:  hub.Blackout,
			Reset:    hub.Reset,
		})
		program = tea.NewProgram(m, tea.WithAltScreen())
		log.SetOutput(tui.NewLogWriter(program))
		log.SetFlags(log.Ltime)
	}

	stateMirror := state.NewMirror(func(diff state.Diff) {
		hub.Broadcast(diff.ToMessage())
	})

	dispatcher := e131.NewDispatcher(cfg)

	blackoutScene := func() map[string]float64 {
		scene := cfg.BlackoutScene
		if len(scene) == 0 {
			scene = make(map[string]float64, len(cfg.Parameters))
			for p := range cfg.Parameters {
				scene[p] = 0
			}
		}
		return scene
	}

	hub.SetOnBlackout(func() {
		dispatcher.Dispatch(blackoutScene(), cfg)
	})

	receiver := udp.NewReceiver(udpPort, func(pkt udp.StatePacket) {
		hub.MaybebroadcastStatus(pkt.SessionID)
		if program != nil {
			program.Send(tui.EmitterSeenMsg{})
			program.Send(tui.SessionMsg(pkt.SessionID))
		}

		if hub.IsBlackout() {
			return
		}

		changed := stateMirror.Update(pkt)
		if changed {
			dispatcher.Dispatch(pkt.State, cfg)
			if program != nil {
				program.Send(tui.ParamUpdateMsg(pkt.State))
			}
		}
	})

	prober := wled.NewProber(cfg, func(id int, online bool) {
		hub.SetUniverseOnline(id, online)
		if program != nil {
			label, ip := "", ""
			if u, ok := cfg.Universes[id]; ok {
				label = u.Label
				ip = u.DeviceIP
			}
			program.Send(tui.UniverseMsg{ID: id, Label: label, IP: ip, Online: online})
		}
	})

	var onConfigUpdate func(*config.Config)
	if program != nil {
		onConfigUpdate = func(c *config.Config) {
			program.Send(tui.EmitterTimeoutsMsg{
				IdleTimeout:       time.Duration(c.Emitter.IdleTimeoutSec) * time.Second,
				DisconnectTimeout: time.Duration(c.Emitter.DisconnectTimeoutSec) * time.Second,
			})
			cm := make(tui.ConfigMsg, len(c.Parameters))
			for param, targets := range c.Parameters {
				tt := make([]tui.ChannelTarget, len(targets))
				for i, t := range targets {
					tt[i] = tui.ChannelTarget{Universe: t.Universe, Channel: t.Channel}
				}
				cm[param] = tt
			}
			program.Send(cm)
			for id, u := range c.Universes {
				program.Send(tui.UniverseMsg{ID: id, Label: u.Label, IP: u.DeviceIP})
			}
		}
	}

	router := api.NewRouter(hub, cfg, wsPort, onConfigUpdate)

	go hub.RunStatusTicker()

	if tuiMode {
		for id, u := range cfg.Universes {
			go program.Send(tui.UniverseMsg{ID: id, Label: u.Label, IP: u.DeviceIP})
		}
		go func() {
			program.Send(tui.EmitterTimeoutsMsg{
				IdleTimeout:       time.Duration(cfg.Emitter.IdleTimeoutSec) * time.Second,
				DisconnectTimeout: time.Duration(cfg.Emitter.DisconnectTimeoutSec) * time.Second,
			})
			cm := make(tui.ConfigMsg, len(cfg.Parameters))
			for param, targets := range cfg.Parameters {
				tt := make([]tui.ChannelTarget, len(targets))
				for i, t := range targets {
					tt[i] = tui.ChannelTarget{Universe: t.Universe, Channel: t.Channel}
				}
				cm[param] = tt
			}
			program.Send(cm)
		}()
		go receiver.Listen()
		go prober.Run()
		go func() {
			log.Printf("Listening on :%d (UDP) and :%d (HTTP/WS)", udpPort, wsPort)
			if err := router.ListenAndServe(); err != nil {
				log.Printf("http: %v", err)
			}
		}()

		if _, err := program.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "tui: %v\n", err)
			os.Exit(1)
		}
	} else {
		go receiver.Listen()
		go prober.Run()
		log.Printf("Listening on :%d (UDP) and :%d (HTTP/WS)", udpPort, wsPort)
		log.Fatal(router.ListenAndServe())
	}
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
