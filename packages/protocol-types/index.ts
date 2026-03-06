// packages/protocol-types/index.ts
//
// WebSocket message types for server ↔ UI communication.
// These must match the Go structs in server/ws/hub.go.
// Go structs are authoritative — update there first, then here.

// ─── Server → UI ──────────────────────────────────────────────────────────────

/** New session detected — emitter restarted or tracks changed */
export interface SessionMessage {
  type: 'session'
  session_id: string
  ts: number
}

/** Full state snapshot — sent on connect and periodically as sync */
export interface StateMessage {
  type: 'state'
  session_id: string
  ts: number
  state: Record<string, number>  // param name → normalised 0.0–1.0
}

/** Changed parameters since last emission */
export interface DiffMessage {
  type: 'diff'
  ts: number
  changes: Record<string, number>
}

export interface ChannelInfo {
  channel: number  // DMX channel 1–512
  param: string    // mapped parameter name
  value: number    // DMX value 0–255
}

export interface UniverseStatus {
  label: string
  device_ip: string
  type: 'wled' | 'gateway'
  online: boolean
  channels: ChannelInfo[]
}

export type EmitterState = 'connected' | 'idle' | 'disconnected'

/** Connection and universe health */
export interface StatusMessage {
  type: 'status'
  emitter_state: EmitterState
  emitter_last_seen: number
  blackout: boolean
  universes: Record<number, UniverseStatus>
}

export type ServerMessage = SessionMessage | StateMessage | DiffMessage | StatusMessage

// ─── UI → Server ──────────────────────────────────────────────────────────────

export interface Patch {
  fixtureKey: string
  label: string
  startAddress: number
  channels?: string[]  // only for fixtureKey === "manual"
}

export interface UniverseConfig {
  device_ip: string
  type: 'wled' | 'gateway'
  label: string
  patches?: Patch[]
}

export interface ParameterConfig {
  universe: number
  channel: number  // DMX channel 1–512
}

/** Update universe and parameter mapping */
export interface SetConfigMessage {
  type: 'set_config'
  universes?: Record<number, UniverseConfig>
  parameters?: Record<string, ParameterConfig>
}

/** Hotkey event — from Electron global shortcut, keyboard, or external source */
export interface HotkeyMessage {
  type: 'hotkey'
  key: string
}

/** Activate emergency blackout */
export interface BlackoutMessage {
  type: 'blackout'
}

/** Reset from blackout — resume normal operation */
export interface ResetMessage {
  type: 'reset'
}

export type UIMessage = SetConfigMessage | HotkeyMessage | BlackoutMessage | ResetMessage
