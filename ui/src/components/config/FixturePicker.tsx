import { useState } from 'react'
import { t } from '@lingui/core/macro'
import type { Fixture } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FixturePickerProps {
  fixtures: Record<string, Fixture> | null
  onSelect: (fixtureKey: string, channels?: string[]) => void
  onCancel: () => void
}

export function FixturePicker({ fixtures, onSelect, onCancel }: FixturePickerProps) {
  const [mode, setMode] = useState<'library' | 'manual'>('library')
  const [search, setSearch] = useState('')
  const [manualCount, setManualCount] = useState(3)

  function handleManualCreate() {
    const channels = Array.from({ length: manualCount }, (_, i) => `Ch ${i + 1}`)
    onSelect('manual', channels)
  }

  return (
    <div className="rounded border border-accent/40 bg-surface p-3 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1">
          <button
            type="button"
            className={cn(
              'px-3 py-1 text-xs rounded border',
              mode === 'library'
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-surface text-text-muted border-border hover:border-border-muted',
            )}
            onClick={() => setMode('library')}
          >
            {t`Library`}
          </button>
          <button
            type="button"
            className={cn(
              'px-3 py-1 text-xs rounded border',
              mode === 'manual'
                ? 'bg-accent/20 text-accent border-accent/30'
                : 'bg-surface text-text-muted border-border hover:border-border-muted',
            )}
            onClick={() => setMode('manual')}
          >
            {t`Manual`}
          </button>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={onCancel}
          title={t`Cancel`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {mode === 'library' && (
        <div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search fixtures...`}
            className="h-8 text-sm mb-3"
          />
          {fixtures ? (
            <LibraryList fixtures={fixtures} search={search} onSelect={onSelect} />
          ) : (
            <div className="text-text-muted text-xs text-center py-4">
              {t`Loading fixtures...`}
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="flex items-center gap-2">
          <label className="text-text-faint text-xs shrink-0">{t`Channels`}</label>
          <Input
            type="number"
            min={1}
            max={512}
            value={manualCount}
            onChange={(e) => setManualCount(Math.max(1, Math.min(512, Number(e.target.value))))}
            className="h-8 text-sm w-20"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={handleManualCreate}>
            {t`Create`}
          </Button>
        </div>
      )}
    </div>
  )
}

function LibraryList({
  fixtures,
  search,
  onSelect,
}: {
  fixtures: Record<string, Fixture>
  search: string
  onSelect: (fixtureKey: string) => void
}) {
  const lowerSearch = search.toLowerCase()

  // Group by manufacturer, filter by search
  const grouped = new Map<string, [string, Fixture][]>()
  for (const [key, fixture] of Object.entries(fixtures)) {
    if (
      lowerSearch &&
      !fixture.name.toLowerCase().includes(lowerSearch) &&
      !fixture.shortName.toLowerCase().includes(lowerSearch) &&
      !fixture.manufacturer.toLowerCase().includes(lowerSearch) &&
      !key.toLowerCase().includes(lowerSearch)
    ) {
      continue
    }
    const list = grouped.get(fixture.manufacturer) ?? []
    list.push([key, fixture])
    grouped.set(fixture.manufacturer, list)
  }

  const sortedGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))

  if (sortedGroups.length === 0) {
    return (
      <div className="text-text-faint text-xs text-center py-4">
        {t`No fixtures found`}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 max-h-64 overflow-y-auto">
      {sortedGroups.map(([manufacturer, items]) => (
        <div key={manufacturer}>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
            {manufacturer}
          </h4>
          <div className="flex flex-col gap-1">
            {items
              .sort(([, a], [, b]) => a.name.localeCompare(b.name))
              .map(([key, fixture]) => (
                <button
                  key={key}
                  type="button"
                  className="rounded border border-border bg-surface-raised p-2 text-left hover:border-accent/40 hover:bg-accent/5 transition-colors"
                  onClick={() => onSelect(key)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{fixture.shortName}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {fixture.channelCount}ch
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {fixture.channels.map((ch) => (
                      <span key={ch} className="text-[10px] text-text-muted">
                        {ch}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
