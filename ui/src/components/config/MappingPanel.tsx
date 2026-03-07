import { Fragment, useEffect, useState } from 'react'
import { t } from '@lingui/core/macro'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ParameterConfig, UniverseConfig, Fixture, Patch } from '@/types'
import { groupParams, parseParam, matchChannels, resolveChannelStates } from './mapping-utils'
import { getChannelNames } from './patch-utils'
import { MappingChannelStrip } from './MappingChannelStrip'

interface MappingPanelProps {
  params: Record<string, number>
  parameters: Record<string, ParameterConfig>
  universes: Record<string, UniverseConfig>
  onSave: (parameters: Record<string, ParameterConfig>) => Promise<void>
  onSaveConfig: (parameters: Record<string, ParameterConfig>, universes: Record<string, UniverseConfig>) => Promise<void>
}

interface ResolvedMapping {
  paramName: string
  value: number
  universe: number | null
  channel: number | null
  universeLabel: string | null
  fixtureLabel: string | null
  channelName: string | null
}

function resolveMapping(
  paramName: string,
  value: number,
  parameters: Record<string, ParameterConfig>,
  universes: Record<string, UniverseConfig>,
  fixtures: Record<string, Fixture> | null,
): ResolvedMapping {
  const base: ResolvedMapping = {
    paramName,
    value,
    universe: null,
    channel: null,
    universeLabel: null,
    fixtureLabel: null,
    channelName: null,
  }

  // Parameters in config.json are arrays (fan-out), but TS type is a single object.
  // Handle both: array or single object at runtime.
  const raw = parameters[paramName]
  if (!raw) return base

  const targets = Array.isArray(raw) ? raw : [raw]
  if (targets.length === 0) return base

  // Use first target for display (fan-out display is a future concern)
  const target = targets[0]
  if (!target || target.universe == null || target.channel == null) return base

  base.universe = target.universe
  base.channel = target.channel

  const uConfig = universes[String(target.universe)]
  if (uConfig) {
    base.universeLabel = uConfig.label || null

    // Find which patch owns this channel
    for (const patch of uConfig.patches ?? []) {
      const names = getChannelNames(patch, fixtures)
      const count = names.length || (fixtures?.[patch.fixtureKey]?.channelCount ?? 0)
      const start = patch.startAddress
      const end = start + count - 1

      if (target.channel >= start && target.channel <= end) {
        base.fixtureLabel = patch.label
        const offset = target.channel - start
        base.channelName = names[offset] ?? null
        break
      }
    }
  }

  return base
}

export function MappingPanel({ params, parameters, universes, onSave, onSaveConfig }: MappingPanelProps) {
  const [fixtures, setFixtures] = useState<Record<string, Fixture> | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState<Set<string> | null>(null)
  const [draggedParams, setDraggedParams] = useState<string[] | null>(null)

  function toggleParam(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectGroup(group: { channels: string[] }) {
    setSelected((prev) => {
      const allSelected = group.channels.every((c) => prev.has(c))
      const next = new Set(prev)
      if (allSelected) {
        group.channels.forEach((c) => next.delete(c))
      } else {
        group.channels.forEach((c) => next.add(c))
      }
      return next
    })
  }

  async function handleDropOnFixture(universeId: string, patchIndex: number) {
    if (!draggedParams) return
    const uConfig = universes[universeId]
    const patch = uConfig.patches?.[patchIndex]
    if (!patch) return

    const fixtureChannelNames =
      patch.fixtureKey === 'manual'
        ? (patch.channels ?? [])
        : (fixtures?.[patch.fixtureKey]?.channels ?? [])

    const emitterChannels = draggedParams.map((n) => parseParam(n).channel)
    const matches = matchChannels(emitterChannels, fixtureChannelNames)

    if (matches.length === 0) return

    const updated = { ...parameters }
    for (const match of matches) {
      const paramName = draggedParams.find(
        (n) => parseParam(n).channel.toLowerCase() === match.emitterChannel.toLowerCase(),
      )
      if (paramName) {
        updated[paramName] = [
          { universe: Number(universeId), channel: patch.startAddress + match.fixtureIndex },
        ] as unknown as ParameterConfig
      }
    }

    await onSave(updated)
    setDragging(null)
    setDraggedParams(null)
  }

  async function handleDropOnEmpty(universeId: string, channel: number) {
    if (!draggedParams) return

    const startStr = window.prompt(
      t`Start channel for new fixture:`,
      String(channel),
    )
    if (startStr === null) return
    const startAddress = parseInt(startStr, 10)
    if (isNaN(startAddress) || startAddress < 1 || startAddress > 512) return

    const emitterChannels = draggedParams.map((n) => parseParam(n).channel)

    const newPatch: Patch = {
      fixtureKey: 'manual',
      label: draggedParams.length === 1
        ? emitterChannels[0]
        : parseParam(draggedParams[0]).group ?? t`Manual`,
      startAddress,
      channels: emitterChannels,
    }

    const uConfig = universes[universeId]
    const updatedUniverses = {
      ...universes,
      [universeId]: {
        ...uConfig,
        patches: [...(uConfig.patches ?? []), newPatch],
      },
    }

    const updatedParams = { ...parameters }
    for (let i = 0; i < draggedParams.length; i++) {
      updatedParams[draggedParams[i]] = [
        { universe: Number(universeId), channel: startAddress + i },
      ] as unknown as ParameterConfig
    }

    await onSaveConfig(updatedParams, updatedUniverses)
    setDragging(null)
    setDraggedParams(null)
  }

  useEffect(() => {
    fetch('/api/fixtures')
      .then((r) => r.json() as Promise<Record<string, Fixture>>)
      .then(setFixtures)
      .catch(() => {})
  }, [])

  const paramNames = Object.keys(params).sort()

  if (paramNames.length === 0) {
    return (
      <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
        {t`No parameters received from emitter.`}
      </div>
    )
  }

  const channelStates = resolveChannelStates(universes, parameters, fixtures)
  const groups = groupParams(paramNames)
  const allRows = paramNames.map((name) =>
    resolveMapping(name, params[name], parameters, universes, fixtures),
  )
  const rowMap = new Map(allRows.map((r) => [r.paramName, r]))
  const mappedCount = allRows.filter((r) => r.universe !== null).length

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-semibold text-text-muted">
          {t`Emitter Parameters (${paramNames.length})`}
        </h2>
        <Badge variant="outline" className="text-[10px]">
          {t`${mappedCount} mapped`}
        </Badge>
        {paramNames.length - mappedCount > 0 && (
          <Badge variant="outline" className="text-[10px] text-warning">
            {t`${paramNames.length - mappedCount} unmapped`}
          </Badge>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-text-muted text-xs text-left">
            <th className="pb-2 font-semibold">{t`Parameter`}</th>
            <th className="pb-2 font-semibold text-right w-16">{t`Value`}</th>
            <th className="pb-2 font-semibold text-center w-12">{t`Univ`}</th>
            <th className="pb-2 font-semibold text-center w-10">{t`Ch`}</th>
            <th className="pb-2 font-semibold">{t`Fixture / Channel`}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.group ?? '__ungrouped'}>
              {g.group && (
                <tr
                  className="bg-surface-raised/50 cursor-grab hover:bg-surface-raised"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/penumbra-params', JSON.stringify({ paramNames: g.channels }))
                    e.dataTransfer.effectAllowed = 'copy'
                    setDragging(new Set(g.channels))
                    setDraggedParams(g.channels)
                  }}
                  onDragEnd={() => { setDragging(null); setDraggedParams(null) }}
                  onClick={() => selectGroup(g)}
                >
                  <td colSpan={5} className="py-1.5 px-1 text-xs font-semibold text-text-muted">
                    <input
                      type="checkbox"
                      className="mr-2 align-middle"
                      checked={g.channels.every((c) => selected.has(c))}
                      readOnly
                    />
                    {g.group}
                  </td>
                </tr>
              )}
              {g.channels.map((name) => {
                const row = rowMap.get(name)!
                const isMapped = row.universe !== null
                const { channel } = parseParam(row.paramName)
                return (
                  <tr
                    key={row.paramName}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/penumbra-params', JSON.stringify({ paramNames: [row.paramName] }))
                      e.dataTransfer.effectAllowed = 'copy'
                      setDragging(new Set([row.paramName]))
                      setDraggedParams([row.paramName])
                    }}
                    onDragEnd={() => { setDragging(null); setDraggedParams(null) }}
                    className={cn(
                      'border-b border-border/50 cursor-grab hover:bg-surface-raised/30',
                      !isMapped && 'opacity-40',
                      selected.has(row.paramName) && 'bg-accent/10',
                      dragging?.has(row.paramName) && 'opacity-20',
                    )}
                    onClick={() => toggleParam(row.paramName)}
                  >
                    <td className="py-1.5 font-mono text-xs">
                      {g.group ? (
                        <span className="pl-3">
                          <input
                            type="checkbox"
                            className="mr-2 align-middle"
                            checked={selected.has(row.paramName)}
                            readOnly
                          />
                          {channel}
                        </span>
                      ) : (
                        <>
                          <input
                            type="checkbox"
                            className="mr-2 align-middle"
                            checked={selected.has(row.paramName)}
                            readOnly
                          />
                          {row.paramName}
                        </>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                      {(row.value * 100).toFixed(0)}%
                    </td>
                    <td className="py-1.5 text-center text-xs">
                      {isMapped ? (
                        <span title={row.universeLabel ?? undefined}>{row.universe}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-1.5 text-center font-mono text-xs">
                      {isMapped ? row.channel : '—'}
                    </td>
                    <td className="py-1.5 text-xs text-text-muted">
                      {isMapped && row.fixtureLabel ? (
                        <>
                          <span>{row.fixtureLabel}</span>
                          {row.channelName && (
                            <span className="text-text-faint"> / {row.channelName}</span>
                          )}
                        </>
                      ) : isMapped ? (
                        <span className="text-text-faint">{t`no fixture at this address`}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="mt-6 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          {t`Universe Channel Maps`}
        </h2>
        {Object.entries(universes).map(([uid, uConfig]) => (
          <MappingChannelStrip
            key={uid}
            universeId={uid}
            universe={uConfig}
            channelStates={channelStates}
            onDropOnFixture={(universeId, patchIndex) => handleDropOnFixture(universeId, patchIndex)}
            onDropOnEmpty={(universeId, channel) => handleDropOnEmpty(universeId, channel)}
          />
        ))}
      </div>
    </div>
  )
}
