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
    return <div className="p-4 text-text-faint text-sm">No universes configured.</div>
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
        {onlineCount} / {entries.length} online
      </div>
      {entries.map(([id, u]) => (
        <div key={id} className="flex items-center gap-3 px-4 min-h-[44px] border-t border-border">
          <Badge
            className={cn(
              'min-w-[52px] justify-center font-semibold',
              u.online ? 'bg-success text-background' : 'bg-border text-text-muted'
            )}
          >
            {u.online ? 'online' : 'offline'}
          </Badge>
          <span className="text-text-dim">
            Universe {id}: {u.label}
          </span>
          <span className="text-text-faint ml-auto">{u.device_ip}</span>
        </div>
      ))}
    </div>
  )
}
