import type { UniverseConfig, ParameterConfig, Fixture } from '@/types'
import { getChannelCount, getChannelNames } from './patch-utils'

export interface ChannelState {
  state: 'mapped' | 'unmapped'
  patchIndex: number
  channelName: string
  patchLabel: string
  fixtureKey: string
}

/**
 * Build a map of "universeId:dmxChannel" -> ChannelState for all patched channels.
 * Channels not in the map are "empty" (no fixture patch covers them).
 */
export function resolveChannelStates(
  universes: Record<string, UniverseConfig>,
  parameters: Record<string, ParameterConfig>,
  fixtures: Record<string, Fixture> | null,
): Map<string, ChannelState> {
  // Build a set of all mapped (universe, channel) pairs from parameters
  const mappedSet = new Set<string>()
  for (const raw of Object.values(parameters)) {
    const targets = Array.isArray(raw) ? raw : [raw]
    for (const t of targets) {
      if (t && typeof t === 'object' && 'universe' in t && 'channel' in t) {
        mappedSet.add(`${t.universe}:${t.channel}`)
      }
    }
  }

  const result = new Map<string, ChannelState>()

  for (const [uid, uConfig] of Object.entries(universes)) {
    for (let pi = 0; pi < (uConfig.patches ?? []).length; pi++) {
      const patch = uConfig.patches![pi]
      const count = getChannelCount(patch, fixtures)
      const names = getChannelNames(patch, fixtures)

      for (let ci = 0; ci < count; ci++) {
        const dmxCh = patch.startAddress + ci
        const key = `${uid}:${dmxCh}`
        result.set(key, {
          state: mappedSet.has(key) ? 'mapped' : 'unmapped',
          patchIndex: pi,
          channelName: names[ci] ?? `Ch ${ci + 1}`,
          patchLabel: patch.label,
          fixtureKey: patch.fixtureKey,
        })
      }
    }
  }

  return result
}

export interface ParsedParam {
  group: string | null
  channel: string
}

/** Split a parameter name on the first `/`. No `/` means ungrouped. */
export function parseParam(name: string): ParsedParam {
  const idx = name.indexOf('/')
  if (idx === -1) return { group: null, channel: name }
  return { group: name.slice(0, idx), channel: name.slice(idx + 1) }
}

export interface ParamGroup {
  group: string | null
  channels: string[] // full param names (e.g. "par_front/Red")
}

/** Group a list of parameter names by their `/` prefix. */
export function groupParams(paramNames: string[]): ParamGroup[] {
  const groups: ParamGroup[] = []
  const seen = new Map<string | null, ParamGroup>()

  for (const name of paramNames) {
    const { group } = parseParam(name)
    const key = group
    let entry = seen.get(key)
    if (!entry) {
      entry = { group, channels: [] }
      seen.set(key, entry)
      groups.push(entry)
    }
    entry.channels.push(name)
  }
  return groups
}

export interface ChannelMatch {
  emitterChannel: string
  fixtureIndex: number // 0-based index into the fixture's channel array
}

/** Match emitter channel names to fixture channel names (case-insensitive). */
export function matchChannels(
  emitterChannels: string[],
  fixtureChannels: string[],
): ChannelMatch[] {
  const fixtureLower = fixtureChannels.map((c) => c.toLowerCase())
  const matches: ChannelMatch[] = []

  for (const ec of emitterChannels) {
    const idx = fixtureLower.indexOf(ec.toLowerCase())
    if (idx !== -1) {
      matches.push({ emitterChannel: ec, fixtureIndex: idx })
    }
  }
  return matches
}
