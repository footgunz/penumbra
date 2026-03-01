import type { StatusMessage } from '../types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  status: StatusMessage | null
  sessionId: string | null
}

export function StatusBar({ status, sessionId }: Props) {
  const connected = status?.m4l_connected ?? false
  const lastSeen = status?.m4l_last_seen
  const universeCount = status ? Object.keys(status.universes).length : 0

  const lastSeenStr = lastSeen
    ? new Date(lastSeen).toLocaleTimeString()
    : '—'

  return (
    <div className="flex items-center gap-4 min-h-[44px] px-4 bg-surface border-b border-border-muted text-sm">
      <Badge
        className={cn(
          'font-semibold',
          connected ? 'bg-success text-background' : 'bg-error text-background'
        )}
      >
        {connected ? 'M4L Connected' : 'M4L Disconnected'}
      </Badge>
      <span className="text-text-muted">Last seen: {lastSeenStr}</span>
      <span className="text-text-muted">
        {universeCount} universe{universeCount !== 1 ? 's' : ''}
      </span>
      {sessionId && (
        <span className="ml-auto text-text-faint text-xs">session: {sessionId}</span>
      )}
    </div>
  )
}
