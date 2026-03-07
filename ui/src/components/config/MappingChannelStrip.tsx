import { useState } from 'react'
import { t } from '@lingui/core/macro'
import { cn } from '@/lib/utils'
import type { UniverseConfig } from '@/types'
import type { ChannelState } from './mapping-utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const FIXTURE_COLORS = [
  { solid: 'bg-blue-500/40 border-blue-500/60 text-blue-200', dimmed: 'bg-blue-500/15 border-blue-500/30 text-blue-400' },
  { solid: 'bg-green-500/40 border-green-500/60 text-green-200', dimmed: 'bg-green-500/15 border-green-500/30 text-green-400' },
  { solid: 'bg-amber-500/40 border-amber-500/60 text-amber-200', dimmed: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
  { solid: 'bg-purple-500/40 border-purple-500/60 text-purple-200', dimmed: 'bg-purple-500/15 border-purple-500/30 text-purple-400' },
  { solid: 'bg-rose-500/40 border-rose-500/60 text-rose-200', dimmed: 'bg-rose-500/15 border-rose-500/30 text-rose-400' },
  { solid: 'bg-cyan-500/40 border-cyan-500/60 text-cyan-200', dimmed: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' },
  { solid: 'bg-orange-500/40 border-orange-500/60 text-orange-200', dimmed: 'bg-orange-500/15 border-orange-500/30 text-orange-400' },
  { solid: 'bg-teal-500/40 border-teal-500/60 text-teal-200', dimmed: 'bg-teal-500/15 border-teal-500/30 text-teal-400' },
]

interface MappingChannelStripProps {
  universeId: string
  universe: UniverseConfig
  channelStates: Map<string, ChannelState>
  onDropOnFixture: (universeId: string, patchIndex: number) => void
  onDropOnEmpty: (universeId: string, channel: number) => void
}

export function MappingChannelStrip({
  universeId,
  universe,
  channelStates,
  onDropOnFixture,
  onDropOnEmpty,
}: MappingChannelStripProps) {
  const [dragOver, setDragOver] = useState<number | null>(null)

  // Determine how many channels to show
  let maxChannel = 0
  for (const patch of universe.patches ?? []) {
    const key = `${universeId}:${patch.startAddress}`
    const cs = channelStates.get(key)
    if (cs) {
      // Find end of this patch by scanning
      let ch = patch.startAddress
      while (channelStates.has(`${universeId}:${ch}`)) ch++
      if (ch - 1 > maxChannel) maxChannel = ch - 1
    }
  }
  const totalChannels = Math.max(16, maxChannel + 4)

  function handleDragOver(e: React.DragEvent, ch: number) {
    const cs = channelStates.get(`${universeId}:${ch}`)
    // Reject drops on already-mapped channels
    if (cs?.state === 'mapped') {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(ch)
  }

  function handleDragLeave() {
    setDragOver(null)
  }

  function handleDrop(e: React.DragEvent, ch: number) {
    e.preventDefault()
    setDragOver(null)
    const cs = channelStates.get(`${universeId}:${ch}`)
    if (cs?.state === 'mapped') return

    if (cs) {
      // Dropped on a patched (unmapped) cell — auto-match to fixture
      onDropOnFixture(universeId, cs.patchIndex)
    } else {
      // Dropped on empty space — prompt for manual fixture
      onDropOnEmpty(universeId, ch)
    }
  }

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-text-muted mb-2">
        {t`Universe ${universeId}`}
        {universe.label && (
          <span className="text-text-faint font-normal"> — {universe.label}</span>
        )}
      </h3>
      <TooltipProvider>
        <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(16, 1fr)' }}>
          {Array.from({ length: totalChannels }, (_, i) => {
            const ch = i + 1
            const cs = channelStates.get(`${universeId}:${ch}`)
            const isDragTarget = dragOver === ch
            const colorSet = cs ? FIXTURE_COLORS[cs.patchIndex % FIXTURE_COLORS.length] : null

            let cellClass: string
            if (cs?.state === 'mapped') {
              cellClass = colorSet!.solid
            } else if (cs?.state === 'unmapped') {
              cellClass = colorSet!.dimmed
            } else {
              cellClass = 'bg-surface border-border text-text-faint/40'
            }

            return (
              <Tooltip key={ch}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'w-12 h-12 rounded-sm border text-[9px] flex flex-col items-center justify-center',
                      cellClass,
                      cs?.state === 'mapped' && 'cursor-not-allowed',
                      cs?.state !== 'mapped' && 'cursor-default',
                      isDragTarget && cs?.state !== 'mapped' && 'ring-2 ring-accent',
                    )}
                    onDragOver={(e) => handleDragOver(e, ch)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, ch)}
                  >
                    <span className="font-mono leading-none">{ch}</span>
                    {cs && (
                      <span className="leading-none mt-0.5 truncate max-w-[44px] text-center">
                        {cs.channelName}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {cs ? (
                    <div className="text-xs">
                      <div>{t`Ch ${ch}: ${cs.channelName}`}</div>
                      <div className="text-text-muted">{cs.patchLabel}</div>
                      <div className="text-text-faint">
                        {cs.state === 'mapped' ? t`Mapped` : t`Unmapped — drop to assign`}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs">{t`Ch ${ch}: empty — drop to create fixture`}</span>
                  )}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      </TooltipProvider>
    </div>
  )
}
