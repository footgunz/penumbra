package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"

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
		m := tui.New()
		program = tea.NewProgram(m, tea.WithAltScreen())
		log.SetOutput(tui.NewLogWriter(program))
		log.SetFlags(log.Ltime)
	}

	stateMirror := state.NewMirror(func(diff state.Diff) {
		hub.Broadcast(diff.ToMessage())
	})

	dispatcher := e131.NewDispatcher(cfg)

	receiver := udp.NewReceiver(udpPort, func(pkt udp.StatePacket) {
		changed := stateMirror.Update(pkt)
		if changed {
			dispatcher.Dispatch(pkt.State, cfg)
		}
		hub.MaybebroadcastStatus(pkt.SessionID)
		if program != nil {
			program.Send(tui.M4LSeenMsg{})
			program.Send(tui.SessionMsg(pkt.SessionID))
			if changed {
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

	router := api.NewRouter(hub, cfg, wsPort)

	if tuiMode {
		for id, u := range cfg.Universes {
			go program.Send(tui.UniverseMsg{ID: id, Label: u.Label, IP: u.DeviceIP})
		}
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
