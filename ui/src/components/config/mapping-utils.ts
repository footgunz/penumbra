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
