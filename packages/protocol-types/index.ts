// packages/protocol-types/index.ts
//
// WebSocket message types for server ↔ UI communication.
// These must match the Go structs in server/ws/hub.go.
// Go structs are authoritative — update there first, then here.

// ─── Server → UI ──────────────────────────────────────────────────────────────

/** New session detected — M4L restarted or tracks changed */
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

export interface UniverseStatus {
  label: string
  ip: string
  active: boolean
}

/** Connection and universe health */
export interface StatusMessage {
  type: 'status'
  m4l_connected: boolean
  m4l_last_seen: number
  universes: Record<number, UniverseStatus>
}

export type ServerMessage = SessionMessage | StateMessage | DiffMessage | StatusMessage

// ─── UI → Server ──────────────────────────────────────────────────────────────

export interface UniverseConfig {
  ip: string
  label: string
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

export type UIMessage = SetConfigMessage | HotkeyMessage
