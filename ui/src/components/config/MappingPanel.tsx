import { Fragment, useEffect, useState } from 'react'
import { t } from '@lingui/core/macro'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ParameterConfig, UniverseConfig, Fixture, Patch } from '@/types'
import { groupParams, parseParam, matchChannels } from './mapping-utils'
import { getChannelNames } from './patch-utils'

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
  const [showPicker, setShowPicker] = useState(false)
  const [preview, setPreview] = useState<{
    universeId: string
    patch: Patch
    matches: Array<{ emitterChannel: string; fixtureIndex: number }>
    startAddress: number
  } | null>(null)

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

  function handleAssign(universeId: string, patch: Patch) {
    const fixtureChannelNames =
      patch.fixtureKey === 'manual'
        ? (patch.channels ?? [])
        : (fixtures?.[patch.fixtureKey]?.channels ?? [])

    const selectedNames = Array.from(selected)
    const emitterChannels = selectedNames.map((n) => parseParam(n).channel)

    const matches = matchChannels(emitterChannels, fixtureChannelNames)

    setPreview({ universeId, patch, matches, startAddress: patch.startAddress })
    setShowPicker(false)
  }

  async function confirmAssignment() {
    if (!preview) return

    const selectedNames = Array.from(selected)
    const updated = { ...parameters }

    for (const match of preview.matches) {
      const paramName = selectedNames.find(
        (n) => parseParam(n).channel.toLowerCase() === match.emitterChannel.toLowerCase(),
      )
      if (paramName) {
        updated[paramName] = [
          { universe: Number(preview.universeId), channel: preview.startAddress + match.fixtureIndex },
        ] as unknown as ParameterConfig
      }
    }

    await onSave(updated)
    setSelected(new Set())
    setPreview(null)
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
        {selected.size > 0 && (
          <button
            className="ml-auto text-xs bg-accent text-accent-foreground px-3 py-1 rounded hover:bg-accent/80"
            onClick={() => setShowPicker(true)}
          >
            {t`Assign ${selected.size} to fixture...`}
          </button>
        )}
      </div>

      {showPicker && (
        <div className="mb-4 border border-border rounded p-3 bg-surface">
          <div className="text-xs font-semibold text-text-muted mb-2">
            {t`Select target fixture patch:`}
          </div>
          {Object.entries(universes).map(([uid, uConfig]) =>
            (uConfig.patches ?? []).map((patch, pIdx) => (
              <button
                key={`${uid}-${pIdx}`}
                className="block w-full text-left text-xs px-2 py-1.5 rounded hover:bg-surface-raised"
                onClick={() => handleAssign(uid, patch)}
              >
                {t`Universe ${uid}`}
                {uConfig.label && <span className="text-text-faint"> ({uConfig.label})</span>}
                {' → '}
                {patch.label}
              </button>
            )),
          )}
          <button
            className="mt-2 text-xs text-text-muted hover:text-text"
            onClick={() => setShowPicker(false)}
          >
            {t`Cancel`}
          </button>
        </div>
      )}

      {preview && (
        <div className="mb-4 border border-border rounded p-3 bg-surface">
          <div className="text-xs font-semibold text-text-muted mb-2">
            {t`Mapping preview — ${preview.patch.label} (Universe ${preview.universeId})`}
          </div>
          {preview.matches.length === 0 ? (
            <div className="text-xs text-warning">{t`No matching channel names found.`}</div>
          ) : (
            <table className="w-full text-xs mb-2">
              <thead>
                <tr className="text-text-muted">
                  <th className="text-left pb-1">{t`Emitter Channel`}</th>
                  <th className="text-left pb-1">{t`Fixture Channel`}</th>
                  <th className="text-center pb-1">{t`DMX Ch`}</th>
                </tr>
              </thead>
              <tbody>
                {preview.matches.map((m) => {
                  const fcNames =
                    preview.patch.fixtureKey === 'manual'
                      ? (preview.patch.channels ?? [])
                      : (fixtures?.[preview.patch.fixtureKey]?.channels ?? [])
                  return (
                    <tr key={m.emitterChannel}>
                      <td className="py-0.5 font-mono">{m.emitterChannel}</td>
                      <td className="py-0.5 font-mono">{fcNames[m.fixtureIndex]}</td>
                      <td className="py-0.5 text-center">{preview.startAddress + m.fixtureIndex}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div className="flex gap-2 mt-2">
            <button
              className="text-xs bg-accent text-accent-foreground px-3 py-1 rounded hover:bg-accent/80"
              onClick={confirmAssignment}
              disabled={preview.matches.length === 0}
            >
              {t`Confirm`}
            </button>
            <button
              className="text-xs text-text-muted hover:text-text"
              onClick={() => setPreview(null)}
            >
              {t`Cancel`}
            </button>
          </div>
        </div>
      )}

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
                  }}
                  onDragEnd={() => setDragging(null)}
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
                    }}
                    onDragEnd={() => setDragging(null)}
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
    </div>
  )
}
