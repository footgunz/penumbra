package config

import (
	"encoding/json"
	"os"
)

// Config holds universe and parameter mapping.
// Loaded from config.json at startup; updated via set_config WebSocket message.
type Config struct {
	Universes  map[string]UniverseConfig  `json:"universes"`
	Parameters map[string]ParameterConfig `json:"parameters"`
	path       string
}

// UniverseConfig maps a universe number (string key) to its target IP and label.
type UniverseConfig struct {
	IP    string `json:"ip"`
	Label string `json:"label"`
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
		Universes:  make(map[string]UniverseConfig),
		Parameters: make(map[string]ParameterConfig),
		path:       path,
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	cfg.path = path
	return cfg, nil
}

// Save writes the config back to the file it was loaded from.
func (c *Config) Save() error {
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.path, data, 0o644)
}
