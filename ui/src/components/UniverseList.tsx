import { t } from '@lingui/core/macro'
import type { StatusMessage, UniverseStatus } from '../types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  status: StatusMessage | null
}

export function UniverseList({ status }: Props) {
  const universes = status?.universes ?? {}
  const entries = Object.entries(universes) as [string, UniverseStatus][]

  if (entries.length === 0) {
    return <div className="p-4 text-text-faint text-sm">{t`No universes configured.`}</div>
  }

  const onlineCount = entries.filter(([, u]) => u.online).length
  const summaryColor =
    onlineCount === entries.length
      ? 'text-success'
      : onlineCount === 0
        ? 'text-error'
        : 'text-text-muted'

  return (
    <div className="flex flex-col text-sm">
      <div className={cn('px-4 py-2 text-xs font-semibold', summaryColor)}>
        {t`${onlineCount} / ${entries.length} online`}
      </div>
      {entries.map(([id, u]) => (
        <div key={id} className="border-t border-border">
          <div className="flex items-center gap-3 px-4 min-h-[44px]">
            <Badge
              className={cn(
                'min-w-[52px] justify-center font-semibold',
                u.online ? 'bg-success text-background' : 'bg-border text-text-muted'
              )}
            >
              {u.online ? t`online` : t`offline`}
            </Badge>
            <span className="text-text-dim">
              {t`Universe ${id}: ${u.label}`}
            </span>
            <span className="text-text-faint ml-auto">{u.device_ip}</span>
          </div>
          {u.channels.length > 0 && (
            <table className="w-full border-collapse mb-1">
              <thead>
                <tr className="text-xs text-text-faint">
                  <th className="text-left font-normal pl-6 pr-2 pb-1 w-12">{t`Ch`}</th>
                  <th className="text-left font-normal pr-2 pb-1">{t`Parameter`}</th>
                  <th className="text-right font-normal pr-4 pb-1 w-20">{t`DMX`}</th>
                  <th className="text-right font-normal pr-4 pb-1 w-16">%</th>
                </tr>
              </thead>
              <tbody>
                {u.channels.map((ch) => (
                  <tr key={ch.channel} className="text-xs">
                    <td className="pl-6 pr-2 py-0.5 text-text-faint tabular-nums">{ch.channel}</td>
                    <td className="pr-2 py-0.5 text-text-dim font-mono">{ch.param}</td>
                    <td className="pr-4 py-0.5 text-right tabular-nums text-text">
                      {ch.value}
                    </td>
                    <td className="pr-4 py-0.5 text-right tabular-nums text-text-faint">
                      {((ch.value / 255) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
