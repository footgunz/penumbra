import { describe, it, expect } from 'vitest'
import { parseParam, groupParams, matchChannels, resolveChannelStates, type ChannelState } from './mapping-utils'
import type { UniverseConfig, ParameterConfig, Fixture } from '@/types'

describe('parseParam', () => {
  it('splits on first / into group and channel', () => {
    expect(parseParam('par_front/Red')).toEqual({ group: 'par_front', channel: 'Red' })
  })

  it('returns null group for params without /', () => {
    expect(parseParam('some_legacy_param')).toEqual({ group: null, channel: 'some_legacy_param' })
  })

  it('handles multiple / by splitting on first only', () => {
    expect(parseParam('a/b/c')).toEqual({ group: 'a', channel: 'b/c' })
  })
})

describe('groupParams', () => {
  it('groups params by prefix', () => {
    const params = ['par/Red', 'par/Green', 'mover/Pan', 'legacy']
    const result = groupParams(params)
    expect(result).toEqual([
      { group: 'par', channels: ['par/Red', 'par/Green'] },
      { group: 'mover', channels: ['mover/Pan'] },
      { group: null, channels: ['legacy'] },
    ])
  })

  it('returns empty array for empty input', () => {
    expect(groupParams([])).toEqual([])
  })

  it('preserves insertion order of groups', () => {
    const params = ['b/X', 'a/Y', 'b/Z']
    const result = groupParams(params)
    expect(result[0].group).toBe('b')
    expect(result[1].group).toBe('a')
  })
})

describe('matchChannels', () => {
  it('matches emitter channels to fixture channels by name', () => {
    const emitterChannels = ['Red', 'Green', 'Blue']
    const fixtureChannels = ['Blue', 'Green', 'Red', 'White']
    const result = matchChannels(emitterChannels, fixtureChannels)
    expect(result).toEqual([
      { emitterChannel: 'Red', fixtureIndex: 2 },
      { emitterChannel: 'Green', fixtureIndex: 1 },
      { emitterChannel: 'Blue', fixtureIndex: 0 },
    ])
  })

  it('skips emitter channels with no fixture match', () => {
    const result = matchChannels(['Red', 'UV'], ['Red', 'Green'])
    expect(result).toEqual([
      { emitterChannel: 'Red', fixtureIndex: 0 },
    ])
  })

  it('is case-insensitive', () => {
    const result = matchChannels(['red'], ['Red'])
    expect(result).toEqual([
      { emitterChannel: 'red', fixtureIndex: 0 },
    ])
  })

  it('returns empty array when nothing matches', () => {
    expect(matchChannels(['X'], ['Y'])).toEqual([])
  })
})

describe('resolveChannelStates', () => {
  const fixtures: Record<string, Fixture> = {
    'generic-rgb': {
      name: 'Generic RGB',
      shortName: 'RGB',
      manufacturer: 'Generic',
      channelCount: 3,
      channels: ['Red', 'Green', 'Blue'],
    },
  }

  it('marks patched channels with no parameter mapping as unmapped', () => {
    const universes: Record<string, UniverseConfig> = {
      '1': {
        label: 'Stage',
        patches: [{ fixtureKey: 'generic-rgb', label: 'RGB 1', startAddress: 1 }],
      },
    }
    const parameters: Record<string, ParameterConfig> = {}
    const result = resolveChannelStates(universes, parameters, fixtures)
    expect(result.get('1:1')).toEqual({
      state: 'unmapped',
      patchIndex: 0,
      channelName: 'Red',
      patchLabel: 'RGB 1',
      fixtureKey: 'generic-rgb',
    })
    expect(result.get('1:2')?.state).toBe('unmapped')
    expect(result.get('1:3')?.state).toBe('unmapped')
  })

  it('marks channels with parameter mappings as mapped', () => {
    const universes: Record<string, UniverseConfig> = {
      '1': {
        label: 'Stage',
        patches: [{ fixtureKey: 'generic-rgb', label: 'RGB 1', startAddress: 1 }],
      },
    }
    const parameters: Record<string, ParameterConfig> = {
      'par_front/Red': [{ universe: 1, channel: 1 }] as unknown as ParameterConfig,
    }
    const result = resolveChannelStates(universes, parameters, fixtures)
    expect(result.get('1:1')?.state).toBe('mapped')
    expect(result.get('1:2')?.state).toBe('unmapped')
  })

  it('returns empty map for channels with no patches', () => {
    const universes: Record<string, UniverseConfig> = {
      '1': { label: 'Stage', patches: [] },
    }
    const result = resolveChannelStates(universes, {}, fixtures)
    expect(result.size).toBe(0)
  })
})
