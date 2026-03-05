import { useEffect, useState } from 'react'
import { t } from '@lingui/core/macro'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { Fixture } from '@/types'

export function FixturesPanel() {
  const [fixtures, setFixtures] = useState<Record<string, Fixture> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/fixtures')
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json() as Promise<Record<string, Fixture>>
      })
      .then(setFixtures)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center flex-1 text-red-400 text-sm">
        {t`Failed to load fixtures: ${error}`}
      </div>
    )
  }

  if (!fixtures) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  // Group by manufacturer
  const grouped = new Map<string, [string, Fixture][]>()
  for (const [key, fixture] of Object.entries(fixtures)) {
    const list = grouped.get(fixture.manufacturer) ?? []
    list.push([key, fixture])
    grouped.set(fixture.manufacturer, list)
  }

  // Sort manufacturers alphabetically
  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="flex flex-col gap-6 p-4 overflow-y-auto flex-1">
      {sortedGroups.map(([manufacturer, items]) => (
        <div key={manufacturer}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
            {manufacturer}
          </h3>
          <div className="flex flex-col gap-2">
            {items
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([key, fixture]) => (
                <div
                  key={key}
                  className="rounded-md border border-border bg-surface-raised p-3"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{fixture.name}</span>
                    {fixture.shortName !== fixture.name && (
                      <span className="text-xs text-text-muted">
                        ({fixture.shortName})
                      </span>
                    )}
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {fixture.channelCount}ch
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {fixture.channels.map((ch) => (
                      <Badge
                        key={ch}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {ch}
                      </Badge>
                    ))}
                    <span className="text-[10px] text-text-muted ml-auto">
                      {key}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
