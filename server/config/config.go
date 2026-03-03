package config

import (
	"encoding/json"
	"log"
	"os"
)

// Config holds universe and parameter mapping.
// Loaded from config.json at startup; updated via set_config WebSocket message.
type Config struct {
	Universes     map[int]UniverseConfig     `json:"universes"`
	Parameters    map[string]ParameterConfig `json:"parameters"`
	Emitter       EmitterConfig              `json:"emitter"`
	BlackoutScene map[string]float64         `json:"blackout_scene"`
	path          string
}

// EmitterConfig holds timeout thresholds for emitter connection state detection.
type EmitterConfig struct {
	IdleTimeoutSec       int `json:"idle_timeout_s"`
	DisconnectTimeoutSec int `json:"disconnect_timeout_s"`
}

// EmitterState represents the tri-state emitter connection status.
type EmitterState int

const (
	EmitterDisconnected EmitterState = iota
	EmitterIdle
	EmitterConnected
)

func (s EmitterState) String() string {
	switch s {
	case EmitterConnected:
		return "connected"
	case EmitterIdle:
		return "idle"
	default:
		return "disconnected"
	}
}

// UniverseConfig maps a universe number (integer key) to its WLED device IP and label.
// DeviceIP is the unicast LAN address used for HTTP health probing — not the E1.31
// multicast destination, which is derived from the universe number directly.
type UniverseConfig struct {
	DeviceIP string `json:"device_ip"`
	Label    string `json:"label"`
}

// ChannelTarget identifies a single DMX channel within a universe.
type ChannelTarget struct {
	Universe int `json:"universe"`
	Channel  int `json:"channel"` // 1-indexed DMX channel
}

// ParameterConfig is the list of DMX targets driven by a single parameter.
// A parameter may fan out to multiple universes and channels simultaneously.
type ParameterConfig []ChannelTarget

// Load reads config from path. Returns an empty-but-valid Config if the file does not exist.
func Load(path string) (*Config, error) {
	cfg := &Config{
		Universes:  make(map[int]UniverseConfig),
		Parameters: make(map[string]ParameterConfig),
		path:       path,
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("config: %s not found, using defaults (cwd: %s)", path, cwd())
			cfg.applyDefaults()
			return cfg, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	cfg.path = path
	cfg.applyDefaults()
	return cfg, nil
}

func (c *Config) applyDefaults() {
	if c.Emitter.IdleTimeoutSec <= 0 {
		c.Emitter.IdleTimeoutSec = 5
	}
	if c.Emitter.DisconnectTimeoutSec <= 0 {
		c.Emitter.DisconnectTimeoutSec = 3600
	}
}

func cwd() string {
	dir, err := os.Getwd()
	if err != nil {
		return "?"
	}
	return dir
}

// Save writes the config back to the file it was loaded from.
func (c *Config) Save() error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.path, data, 0o644)
}
