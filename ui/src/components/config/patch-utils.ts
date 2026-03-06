import type { Patch, Fixture } from '@/types'

/** Returns channel count for a patch — from fixture library, manual channels, or 0. */
export function getChannelCount(
  patch: Patch,
  fixtures: Record<string, Fixture> | null,
): number {
  if (patch.fixtureKey === 'manual') {
    return patch.channels?.length ?? 0
  }
  return fixtures?.[patch.fixtureKey]?.channelCount ?? 0
}

/** Returns channel name array for a patch. */
export function getChannelNames(
  patch: Patch,
  fixtures: Record<string, Fixture> | null,
): string[] {
  if (patch.fixtureKey === 'manual') {
    return patch.channels ?? []
  }
  const fixture = fixtures?.[patch.fixtureKey]
  return fixture?.channels ?? []
}

/** Finds the first free DMX address after all existing patches. */
export function nextFreeAddress(
  patches: Patch[],
  fixtures: Record<string, Fixture> | null,
): number {
  let max = 0
  for (const p of patches) {
    const count = getChannelCount(p, fixtures)
    const end = p.startAddress + count - 1
    if (end > max) max = end
  }
  return max + 1
}

export interface OverlapInfo {
  indexA: number
  indexB: number
  channel: number
}

/** Returns overlap info if any two patches share a DMX channel, or null. */
export function hasOverlap(
  patches: Patch[],
  fixtures: Record<string, Fixture> | null,
): OverlapInfo | null {
  for (let i = 0; i < patches.length; i++) {
    const aStart = patches[i].startAddress
    const aCount = getChannelCount(patches[i], fixtures)
    const aEnd = aStart + aCount - 1

    for (let j = i + 1; j < patches.length; j++) {
      const bStart = patches[j].startAddress
      const bCount = getChannelCount(patches[j], fixtures)
      const bEnd = bStart + bCount - 1

      if (aStart <= bEnd && bStart <= aEnd) {
        return { indexA: i, indexB: j, channel: Math.max(aStart, bStart) }
      }
    }
  }
  return null
}
