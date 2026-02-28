# fake-emitter

Replaces the M4L device for development. Sends identical UDP MessagePack packets
to the Go server at 40ms intervals. No Ableton Live license required.

## Usage

```bash
# Static — fixed mid-values, good for plumbing tests
go run . --mode static

# Animated — values sweep over time, good for testing E1.31 output on hardware
go run . --mode animated

# Target a remote server
go run . --mode animated --target 192.168.1.50:7000

# Custom session ID (triggers a session reset on the server)
go run . --mode animated --session my-session-001
```

## Modes

| Mode | Description |
|------|-------------|
| `static` | All parameters fixed at 0.5 |
| `animated` | Each parameter sweeps sinusoidally at a unique rate |
| `scripted` | Replay state from a JSON scene file *(not yet implemented)* |

## Scene files (future)

Scene files in `scenes/` define scripted sequences of state frames with
millisecond offsets. See `scenes/example.json` for the format.

When scripted mode is implemented, frames will be interpolated between offsets
and replayed in a loop. This will allow recording a real Live session and
replaying it on the dev machine for regression testing.

## Parameters

The default parameter set is defined in `main.go` as `defaultParameters`.
Update this to match your Live session's parameter names when testing
server-side channel mapping.
