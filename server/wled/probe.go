// Package wled provides health probing for WLED devices.
// It periodically GETs /json/info on each configured universe IP and notifies
// callers when online status changes.
package wled

import (
	"fmt"
	"net/http"
	"time"

	"github.com/footgunz/penumbra/config"
)

const (
	probeInterval = 10 * time.Second
	probeTimeout  = 3 * time.Second
)

// Prober probes each configured universe's WLED device and calls onChange
// whenever a device transitions between online and offline.
type Prober struct {
	cfg      *config.Config
	onChange func(id int, online bool)
	online   map[int]bool
	client   *http.Client
}

// NewProber creates a Prober. Call Run() in a goroutine to start probing.
func NewProber(cfg *config.Config, onChange func(id int, online bool)) *Prober {
	return &Prober{
		cfg:      cfg,
		onChange: onChange,
		online:   make(map[int]bool),
		client:   &http.Client{Timeout: probeTimeout},
	}
}

// Run probes all universes immediately, then again every probeInterval. Blocks forever.
func (p *Prober) Run() {
	p.probeAll()
	ticker := time.NewTicker(probeInterval)
	defer ticker.Stop()
	for range ticker.C {
		p.probeAll()
	}
}

func (p *Prober) probeAll() {
	for id, u := range p.cfg.Universes {
		online := p.probe(u.DeviceIP)
		was, seen := p.online[id]
		if !seen || was != online {
			p.online[id] = online
			p.onChange(id, online)
		}
	}
}

func (p *Prober) probe(ip string) bool {
	resp, err := p.client.Get(fmt.Sprintf("http://%s/json/info", ip))
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}
