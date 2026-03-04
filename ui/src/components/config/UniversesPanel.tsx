import type { UniverseConfig } from '@/types'

interface UniversesPanelProps {
  universes: Record<string, UniverseConfig>
  onChange: (universes: Record<string, UniverseConfig>) => void
}

export function UniversesPanel({ universes }: UniversesPanelProps) {
  const count = Object.keys(universes).length
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      Universe editor — {count} universe{count !== 1 ? 's' : ''} configured
    </div>
  )
}
