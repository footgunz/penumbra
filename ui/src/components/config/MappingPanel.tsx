import { Fragment, useEffect, useState } from 'react'
import { t } from '@lingui/core/macro'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ParameterConfig, UniverseConfig, Fixture } from '@/types'
import { groupParams, parseParam } from './mapping-utils'
import { getChannelNames } from './patch-utils'

interface MappingPanelProps {
  params: Record<string, number>
  parameters: Record<string, ParameterConfig>
  universes: Record<string, UniverseConfig>
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

export function MappingPanel({ params, parameters, universes }: MappingPanelProps) {
  const [fixtures, setFixtures] = useState<Record<string, Fixture> | null>(null)

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
                <tr className="bg-surface-raised/50">
                  <td colSpan={5} className="py-1.5 px-1 text-xs font-semibold text-text-muted">
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
                    className={cn(
                      'border-b border-border/50',
                      !isMapped && 'opacity-40',
                    )}
                  >
                    <td className="py-1.5 font-mono text-xs">
                      {g.group ? (
                        <span className="pl-3">{channel}</span>
                      ) : (
                        row.paramName
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
