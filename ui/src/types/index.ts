// Import + re-export wire types from the shared protocol-types package.
import type {
  UniverseConfig,
  ParameterConfig,
} from '@penumbra/protocol-types'

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
} from '@penumbra/protocol-types'

// UI-only types

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/** Full config object matching GET /api/config response (server/config/config.go) */
export interface AppConfig {
  universes: Record<string, UniverseConfig>
  parameters: Record<string, ParameterConfig>
  emitter?: { timeout_ms: number }
  blackout_scene?: Record<string, number>
}
