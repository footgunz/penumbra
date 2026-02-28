// Re-export all wire types from the shared protocol-types package.
export type {
  SessionMessage,
  StateMessage,
  DiffMessage,
  UniverseStatus,
  StatusMessage,
  ServerMessage,
  UniverseConfig,
  ParameterConfig,
  SetConfigMessage,
  HotkeyMessage,
  UIMessage,
} from '@ableton-dmx/protocol-types'

// UI-only types

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'
