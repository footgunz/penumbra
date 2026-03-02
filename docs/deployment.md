# Deployment

---

## Local mode (Electron)

Download the Electron app from the [Releases](https://github.com/footgunz/penumbra/releases)
page. It bundles the Go server and launches it automatically on startup.

The app serves the UI at `http://localhost:3000`. Global hotkeys work even
when the window is not focused.

---

## Headless mode (Linux / Raspberry Pi)

Run the Go binary directly — no Electron, no Node, no dependencies.

### 1. Download or cross-compile the binary

Pre-built binaries for Linux (amd64, arm64) are on the
[Releases](https://github.com/footgunz/penumbra/releases) page.

To cross-compile from the repo:

```bash
# For Raspberry Pi (arm64)
cd server
GOOS=linux GOARCH=arm64 go build -o penumbra-server .

# For Linux amd64
GOOS=linux GOARCH=amd64 go build -o penumbra-server .
```

### 2. Copy to the server

```bash
scp penumbra-server pi@yourpi:~/penumbra-server
scp server/config.json pi@yourpi:~/config.json
```

### 3. Run

```bash
ssh pi@yourpi
chmod +x ~/penumbra-server
~/penumbra-server
```

The server listens on port 3000 by default. Open `http://yourpi:3000` in any
browser to access the UI.

### 4. Run as a systemd service (optional)

Create `/etc/systemd/system/penumbra.service`:

```ini
[Unit]
Description=Penumbra DMX server
After=network.target

[Service]
ExecStart=/home/pi/penumbra-server
WorkingDirectory=/home/pi
Restart=on-failure
User=pi

[Install]
WantedBy=multi-user.target
```

Then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable penumbra
sudo systemctl start penumbra
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UDP_PORT` | `7000` | Port to receive M4L state packets |
| `WS_PORT` | `3000` | Port for WebSocket, HTTP, and embedded UI |

---

## Network requirements

E1.31 uses UDP multicast. For reliable delivery:

- **Managed switch recommended** — some consumer routers and APs block multicast
  between WiFi clients
- **WLED unicast fallback** — configurable per device in WLED's network settings
  if multicast is unavailable on your network
