import type { StatusMessage } from '../types'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { client } from '@/ws/client'

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
  const blackout = status?.blackout ?? false
  const lastSeen = status?.m4l_last_seen
  const universeCount = status ? Object.keys(status.universes).length : 0

  const lastSeenStr = lastSeen
    ? new Date(lastSeen).toLocaleTimeString()
    : '—'

  return (
    <>
      {blackout && (
        <div className="flex items-center justify-between px-4 py-2 bg-error text-background font-bold text-sm">
          <span>██ BLACKOUT ACTIVE ██</span>
          <button
            onClick={() => client.send({ type: 'reset' })}
            className="px-3 py-1 bg-background text-error rounded font-semibold text-xs uppercase tracking-wider hover:bg-background/80"
          >
            Reset
          </button>
        </div>
      )}
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
        {!blackout && (
          <button
            onClick={() => client.send({ type: 'blackout' })}
            className="px-2 py-1 bg-error/20 text-error rounded text-xs font-semibold uppercase tracking-wider hover:bg-error/40 border border-error/30"
          >
            E-Stop
          </button>
        )}
        {sessionId && (
          <span className="ml-auto text-text-faint text-xs">session: {sessionId}</span>
        )}
      </div>
    </>
  )
}
