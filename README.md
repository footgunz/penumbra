# Penumbra

A full-stack DMX/E.131 lighting control system with a desktop app, web UI, and a server that speaks E.131 to real lighting hardware.

## Architecture

```
penumbra/
├── server/          # Node.js backend — E.131, UDP, WebSocket, API, state
├── ui/              # Web UI — components, hotkeys, WebSocket client
├── electron/        # Desktop app wrapper
├── device/          # Device-level scripts
├── packages/
│   └── protocol-types/  # Shared type definitions
└── tools/
    └── fake-emitter/    # Device simulator for development
```

## Stack

- **Protocol**: E.131 (DMX over IP)
- **Transport**: UDP + WebSocket
- **Frontend**: Web UI (Electron-wrapped for desktop)
- **Backend**: Node.js

## Development

### Simulate a device

Use the fake emitter to simulate hardware during development:

```sh
cd tools/fake-emitter
# (usage TBD)
```
