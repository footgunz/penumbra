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

const estopHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>Penumbra E-Stop</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#111;color:#fff;
  height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  -webkit-user-select:none;user-select:none;overflow:hidden}
h1{font-size:1rem;letter-spacing:.15em;text-transform:uppercase;color:#666;margin-bottom:2rem}
#btn{width:min(80vw,320px);height:min(80vw,320px);border-radius:50%;border:none;
  font-size:1.5rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;
  cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;
  -webkit-tap-highlight-color:transparent}
.armed #btn{background:#d00;color:#fff;box-shadow:0 0 40px rgba(220,0,0,.5)}
.armed #btn:active{transform:scale(.95);background:#b00}
.blackout #btn{background:#222;color:#4f4;border:3px solid #4f4;box-shadow:0 0 30px rgba(0,255,0,.2)}
.blackout #btn:active{transform:scale(.95)}
#status{margin-top:1.5rem;font-size:.75rem;color:#666;letter-spacing:.1em}
.blackout h1{color:#d00}
</style>
</head>
<body class="armed">
<h1>Penumbra</h1>
<button id="btn" onclick="toggle()">BLACKOUT</button>
<div id="status">connecting...</div>
<script>
var blackout=false,ws;
function toggle(){
  fetch('/api/'+(blackout?'reset':'blackout'),{method:'POST'}).catch(function(){});
}
function render(){
  document.body.className=blackout?'blackout':'armed';
  document.getElementById('btn').textContent=blackout?'RESET':'BLACKOUT';
}
function connect(){
  var proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/ws');
  ws.onmessage=function(e){
    try{var m=JSON.parse(e.data);
      if(m.type==='status'){blackout=m.blackout;render();
        document.getElementById('status').textContent=blackout?'BLACKOUT ACTIVE':'ready';}
    }catch(x){}
  };
  ws.onopen=function(){document.getElementById('status').textContent='ready';};
  ws.onclose=function(){document.getElementById('status').textContent='disconnected';
    setTimeout(connect,1000);};
}
connect();
</script>
</body>
</html>`

// NewRouter wires HTTP routes and returns an *http.Server ready for ListenAndServe.
// onConfigUpdate is called after a successful POST /api/config (may be nil).
//
// Routes:
//   GET  /ws             → WebSocket upgrade
//   GET  /api/config     → Return current config as JSON
//   POST /api/config     → Update universe/parameter mapping and persist
//   POST /api/blackout   → Enter blackout mode
//   POST /api/reset      → Exit blackout mode
//   GET  /               → Serve embedded Vite/React PWA (ui/dist)
func NewRouter(hub *ws.Hub, cfg *config.Config, port int, onConfigUpdate func(*config.Config)) *http.Server {
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", hub.ServeWS)

	// Config endpoint — GET returns current config, POST updates it
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			data, err := json.MarshalIndent(cfg, "", "  ")
			if err != nil {
				http.Error(w, "marshal error", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(data)

		case http.MethodPost:
			body, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "read error", http.StatusBadRequest)
				return
			}
			var update struct {
				Universes  map[int]config.UniverseConfig     `json:"universes"`
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
			log.Printf("api: config updated (%d universes, %d parameters)",
				len(cfg.Universes), len(cfg.Parameters))
			hub.BroadcastStatus()
			if onConfigUpdate != nil {
				onConfigUpdate(cfg)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"ok":true}`))

		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Blackout / Reset endpoints
	mux.HandleFunc("/api/blackout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		hub.Blackout()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true,"blackout":true}`))
	})

	mux.HandleFunc("/api/reset", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		hub.Reset()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true,"blackout":false}`))
	})

	// E-Stop page — standalone mobile-friendly big red button
	mux.HandleFunc("/estop", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(estopHTML))
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
