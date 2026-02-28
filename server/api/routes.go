package api

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"

	"github.com/footgunz/penumbra/config"
	"github.com/footgunz/penumbra/ui"
	"github.com/footgunz/penumbra/ws"
)

// NewRouter wires HTTP routes and returns an *http.Server ready for ListenAndServe.
//
// Routes:
//   GET /ws          → WebSocket upgrade
//   POST /api/config → Update universe/parameter mapping and persist
//   GET /            → Serve embedded Vite/React PWA (ui/dist)
func NewRouter(hub *ws.Hub, cfg *config.Config, port int) *http.Server {
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", hub.ServeWS)

	// Config update endpoint
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read error", http.StatusBadRequest)
			return
		}
		var update struct {
			Universes  map[string]config.UniverseConfig  `json:"universes"`
			Parameters map[string]config.ParameterConfig `json:"parameters"`
		}
		if err := json.Unmarshal(body, &update); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if update.Universes != nil {
			cfg.Universes = update.Universes
		}
		if update.Parameters != nil {
			cfg.Parameters = update.Parameters
		}
		if err := cfg.Save(); err != nil {
			log.Printf("api: config save: %v", err)
			http.Error(w, "save error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	})

	// Serve embedded UI — strip the "dist" prefix so "/" maps to "dist/index.html"
	distFS, err := fs.Sub(ui.FS, "dist")
	if err != nil {
		log.Fatalf("api: embed sub: %v", err)
	}
	fileServer := http.FileServer(http.FS(distFS))
	mux.Handle("/", fileServer)

	return &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}
}
