# Emitter Specification

Penumbra's server is emitter-agnostic. Any software that can send UDP packets with MessagePack payloads can drive DMX lighting through the Penumbra stack. This document specifies everything needed to write an emitter — no other Penumbra code or documentation is required.

---

## Overview

An emitter reads parameter state from its host application (DAW, VJ software, game engine, live coding environment, etc.) and sends it to the Penumbra server as UDP packets at a regular cadence. The server handles all intelligence: diff detection, universe partitioning, DMX value scaling, and E1.31 output.

The emitter's only job is: **read state, serialize, send.**

```
Your Application
      │
      │  UDP unicast · MessagePack · ~25 Hz
      ▼
  Penumbra Server ──► WLED / ESP32 (E1.31)
```

---

## Transport

| Property       | Value                                         |
|----------------|-----------------------------------------------|
| Protocol       | UDP unicast                                   |
| Default port   | 7000 (configurable via `UDP_PORT` on server)  |
| Serialization  | [MessagePack](https://msgpack.org)            |
| Cadence        | Every 40ms (25 Hz) — adjustable, see below    |
| Packet size    | Typically < 1 KB, must fit in a single UDP datagram |

UDP is intentionally fire-and-forget. No acknowledgements, no retransmission, no connection handshake. The server tolerates dropped packets, duplicate packets, and out-of-order delivery.

---

## Packet Format

Every packet is a MessagePack map with three fields:

| Field        | Type                       | Description                              |
|--------------|----------------------------|------------------------------------------|
| `session_id` | string                     | Identifies the current session/set       |
| `ts`         | integer (int64)            | Unix timestamp in milliseconds           |
| `state`      | map\<string, float64\>     | Parameter name → normalised value 0.0–1.0 |

### Example (JSON representation)

```json
{
  "session_id": "my-set-2026-03-03",
  "ts": 1709123456789,
  "state": {
    "par_front_Dimmer": 0.85,
    "par_front_Red": 0.5,
    "par_front_Green": 0.0,
    "par_front_Blue": 1.0,
    "mover_back_Pan": 0.33,
    "mover_back_Tilt": 0.67
  }
}
```

### Field details

**`session_id`** — An arbitrary string that stays constant for the lifetime of a session. When the server sees a new `session_id`, it resets its state mirror and treats it as a fresh session. Use a UUID, timestamp, set name, or any stable identifier. Change it when the parameter set changes (e.g., tracks added/removed).

**`ts`** — Unix milliseconds (`Date.now()` in JS, `time.Now().UnixMilli()` in Go, `int(time.time() * 1000)` in Python). Used by the server for ordering and staleness detection.

**`state`** — The complete parameter state. Every packet must contain **all** parameters, not just the ones that changed. The server computes diffs internally. Values are normalised floats: `0.0` = minimum/off, `1.0` = maximum/full. The server scales to DMX 0–255 based on its channel mapping configuration.

### Parameter naming

Parameter names are arbitrary strings. The server maps them to DMX channels via its `config.json`. A good convention is `{fixture}_{Parameter}` (e.g., `par_front_Dimmer`, `mover_back_Pan`) but the server imposes no naming rules.

---

## Session Lifecycle

```
Emitter starts
  → generate session_id
  → begin sending state packets at regular cadence

Parameter set changes (e.g., tracks added/removed)
  → generate new session_id
  → server detects change, resets state mirror

Emitter stops
  → just stop sending — no disconnect message needed
  → server detects idle/disconnect via configurable timeouts
```

No handshake, no registration, no teardown. Start sending packets and the server picks them up. Stop sending and the server notices.

---

## Cadence

The recommended cadence is **40ms (25 Hz)**. This matches DMX refresh rates and is imperceptible for lighting. Acceptable range:

| Cadence | Use case |
|---------|----------|
| 20ms (50 Hz) | Maximum useful rate for E1.31 |
| 40ms (25 Hz) | Recommended default |
| 100ms (10 Hz) | Acceptable for slow-moving parameters |
| 200ms+ | Noticeable stepping on fast transitions |

The server does not enforce a specific cadence. Faster is fine (the server deduplicates unchanged state). Slower is fine (transitions just get less smooth).

---

## Minimal Implementation

### Python (~20 lines)

```python
import socket, time, msgpack

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
target = ("localhost", 7000)
session_id = f"python-{int(time.time())}"

while True:
    state = {
        "par_front_Dimmer": 0.75,
        "par_front_Red": 0.5,
    }
    packet = msgpack.packb({
        "session_id": session_id,
        "ts": int(time.time() * 1000),
        "state": state,
    })
    sock.sendto(packet, target)
    time.sleep(0.04)
```

### JavaScript / Node.js

```javascript
const dgram = require('dgram')
const { encode } = require('@msgpack/msgpack')

const sock = dgram.createSocket('udp4')
const sessionId = `node-${Date.now()}`

setInterval(() => {
  const packet = encode({
    session_id: sessionId,
    ts: Date.now(),
    state: {
      par_front_Dimmer: 0.75,
      par_front_Red: 0.5,
    },
  })
  sock.send(packet, 7000, 'localhost')
}, 40)
```

### Go

See [`tools/fake-emitter/main.go`](../tools/fake-emitter/main.go) for a complete working example with static, animated, and stress test modes.

---

## MessagePack Libraries

| Language       | Library                                                  |
|----------------|----------------------------------------------------------|
| Python         | [msgpack-python](https://pypi.org/project/msgpack/)     |
| JavaScript     | [@msgpack/msgpack](https://www.npmjs.com/package/@msgpack/msgpack) |
| Go             | [vmihailenco/msgpack](https://github.com/vmihailenco/msgpack) |
| Rust           | [rmp-serde](https://crates.io/crates/rmp-serde)         |
| C/C++          | [msgpack-c](https://github.com/msgpack/msgpack-c)       |
| Java/Kotlin    | [msgpack-java](https://github.com/msgpack/msgpack-java) |
| C# / .NET      | [MessagePack-CSharp](https://github.com/MessagePack-CSharp/MessagePack-CSharp) |
| Lua            | [lua-MessagePack](https://fperrad.frama.io/lua-MessagePack/) |
| Max/MSP (JS)   | Bundle `@msgpack/msgpack` with esbuild (see M4L device) |

---

## Server-Side Configuration

The emitter does not need to know about DMX universes, channels, or hardware. The server maps parameter names to DMX outputs via `config.json`:

```json
{
  "universes": {
    "1": { "device_ip": "192.168.1.101", "label": "stage left" }
  },
  "parameters": {
    "par_front_Dimmer": [{ "universe": 1, "channel": 1 }],
    "par_front_Red":    [{ "universe": 1, "channel": 2 }]
  }
}
```

A single parameter can fan out to multiple universes and channels. The emitter doesn't need to care — it just sends named float values.

---

## Testing Your Emitter

1. Start the Penumbra server: `task server:dev` (or `task server:tui` for visual feedback)
2. Run your emitter
3. Verify in the TUI or web UI that parameters appear and update
4. Check the server log for any decode errors

The server logs `udp: decode error: ...` if it receives a malformed packet. Common issues:
- Sending JSON instead of MessagePack
- Missing `session_id` field
- Non-float values in the `state` map
