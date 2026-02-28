package main

import (
	"log"
	"os"
	"strconv"

	"github.com/footgunz/penumbra/api"
	"github.com/footgunz/penumbra/config"
	"github.com/footgunz/penumbra/e131"
	"github.com/footgunz/penumbra/state"
	"github.com/footgunz/penumbra/udp"
	"github.com/footgunz/penumbra/ws"
)

func main() {
	udpPort := envInt("UDP_PORT", 7000)
	wsPort := envInt("WS_PORT", 3000)

	cfg, err := config.Load("config.json")
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	hub := ws.NewHub()
	go hub.Run()

	stateMirror := state.NewMirror(func(diff state.Diff) {
		// Forward diff to UI clients
		hub.Broadcast(diff.ToMessage())
	})

	dispatcher := e131.NewDispatcher(cfg)

	receiver := udp.NewReceiver(udpPort, func(pkt udp.StatePacket) {
		changed := stateMirror.Update(pkt)
		if changed {
			dispatcher.Dispatch(pkt.State, cfg)
		}
		hub.MaybebroadcastStatus(pkt.SessionID)
	})

	go receiver.Listen()

	router := api.NewRouter(hub, cfg, wsPort)
	log.Printf("Listening on :%d (UDP) and :%d (HTTP/WS)", udpPort, wsPort)
	log.Fatal(router.ListenAndServe())
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
