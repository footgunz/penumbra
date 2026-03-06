import { t } from '@lingui/core/macro'
import type { Patch } from '@/types'
import type { Fixture } from '@/types'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getChannelCount, getChannelNames } from './patch-utils'

interface ChannelStripProps {
  patches: Patch[]
  fixtures: Record<string, Fixture> | null
}

const FIXTURE_COLORS = [
  'bg-blue-500/30 border-blue-500/50 text-blue-300',
  'bg-green-500/30 border-green-500/50 text-green-300',
  'bg-amber-500/30 border-amber-500/50 text-amber-300',
  'bg-purple-500/30 border-purple-500/50 text-purple-300',
  'bg-rose-500/30 border-rose-500/50 text-rose-300',
  'bg-cyan-500/30 border-cyan-500/50 text-cyan-300',
  'bg-orange-500/30 border-orange-500/50 text-orange-300',
  'bg-teal-500/30 border-teal-500/50 text-teal-300',
]

interface ChannelCell {
  patchIndex: number
  channelName: string
  patchLabel: string
  colorClass: string
}

export function ChannelStrip({ patches, fixtures }: ChannelStripProps) {
  // Build a map of DMX channel -> cell info
  const channelMap = new Map<number, ChannelCell>()
  let maxChannel = 0

  for (let pi = 0; pi < patches.length; pi++) {
    const patch = patches[pi]
    const count = getChannelCount(patch, fixtures)
    const names = getChannelNames(patch, fixtures)
    const colorClass = FIXTURE_COLORS[pi % FIXTURE_COLORS.length]

    for (let ci = 0; ci < count; ci++) {
      const dmxCh = patch.startAddress + ci
      channelMap.set(dmxCh, {
        patchIndex: pi,
        channelName: names[ci] ?? `Ch ${ci + 1}`,
        patchLabel: patch.label,
        colorClass,
      })
      if (dmxCh > maxChannel) maxChannel = dmxCh
    }
  }

  // Show at least 16 channels, or last occupied + some padding
  const totalChannels = Math.max(16, maxChannel + 4)

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-text-muted mb-2">
        {t`Channel Map`}
      </h3>
      <TooltipProvider>
        <div className="flex flex-wrap gap-0.5">
          {Array.from({ length: totalChannels }, (_, i) => {
            const ch = i + 1
            const cell = channelMap.get(ch)

            return (
              <Tooltip key={ch}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'w-8 h-10 rounded-sm border text-[9px] flex flex-col items-center justify-center cursor-default',
                      cell
                        ? cell.colorClass
                        : 'bg-surface border-border text-text-faint/40',
                    )}
                  >
                    <span className="font-mono leading-none">{ch}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {cell ? (
                    <div className="text-xs">
                      <div>{t`Ch ${ch}: ${cell.channelName}`}</div>
                      <div className="text-text-muted">{cell.patchLabel}</div>
                    </div>
                  ) : (
                    <span>{t`Ch ${ch}: empty`}</span>
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
