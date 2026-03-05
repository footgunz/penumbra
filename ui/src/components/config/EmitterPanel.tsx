import { t } from '@lingui/core/macro'
import type { AppConfig } from '@/types'

interface EmitterPanelProps {
  emitter: AppConfig['emitter']
  onChange: (emitter: AppConfig['emitter']) => void
}

export function EmitterPanel({ emitter }: EmitterPanelProps) {
  const idle = emitter?.idle_timeout_s ?? '—'
  const disconnect = emitter?.disconnect_timeout_s ?? '—'
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      {t`Emitter settings — idle timeout: ${idle}s, disconnect timeout: ${disconnect}s`}
    </div>
  )
}
