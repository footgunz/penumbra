import { t } from '@lingui/core/macro'
import type { ParameterConfig } from '@/types'

interface MappingPanelProps {
  parameters: Record<string, ParameterConfig>
  onChange: (parameters: Record<string, ParameterConfig>) => void
}

export function MappingPanel({ parameters }: MappingPanelProps) {
  const count = Object.keys(parameters).length
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      {t`Parameter mapping — ${count} parameter${count !== 1 ? 's' : ''} mapped`}
    </div>
  )
}
