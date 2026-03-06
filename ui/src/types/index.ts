// Import + re-export wire types from the shared protocol-types package.
import type {
  UniverseConfig,
  ParameterConfig,
  Patch,
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
  Patch,
  SetConfigMessage,
  HotkeyMessage,
  UIMessage,
} from '@penumbra/protocol-types'

// UI-only types

/** Fixture definition from GET /api/fixtures (server/fixtures/library.go) */
export interface Fixture {
  name: string
  shortName: string
  manufacturer: string
  channelCount: number
  channels: string[]
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/** Full config object matching GET /api/config response (server/config/config.go) */
export interface AppConfig {
  universes: Record<string, UniverseConfig>
  parameters: Record<string, ParameterConfig>
  emitter?: { idle_timeout_s: number; disconnect_timeout_s: number }
  blackout_scene?: Record<string, number>
}
