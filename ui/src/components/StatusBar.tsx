import type { StatusMessage } from '../types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Props {
  status: StatusMessage | null
  sessionId: string | null
}

const m4lBadge: Record<string, { label: string; className: string }> = {
  connected:    { label: 'M4L Connected',    className: 'bg-success text-background' },
  idle:         { label: 'M4L Idle',         className: 'bg-warning text-background' },
  disconnected: { label: 'M4L Disconnected', className: 'bg-error text-background' },
}

export function StatusBar({ status, sessionId }: Props) {
  const state = status?.m4l_state ?? 'disconnected'
  const badge = m4lBadge[state] ?? m4lBadge.disconnected
  const lastSeen = status?.m4l_last_seen
  const universeCount = status ? Object.keys(status.universes).length : 0

  const lastSeenStr = lastSeen
    ? new Date(lastSeen).toLocaleTimeString()
    : '—'

  return (
    <div className="flex items-center gap-4 min-h-[44px] px-4 bg-surface border-b border-border-muted text-sm">
      <Badge
        className={cn('font-semibold', badge.className)}
      >
        {badge.label}
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
