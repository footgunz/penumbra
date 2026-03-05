import type { AppConfig } from '@/types'

interface EmitterPanelProps {
  emitter: AppConfig['emitter']
  onChange: (emitter: AppConfig['emitter']) => void
}

export function EmitterPanel({ emitter }: EmitterPanelProps) {
  return (
    <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
      Emitter settings — idle timeout: {emitter?.idle_timeout_s ?? '—'}s, disconnect timeout: {emitter?.disconnect_timeout_s ?? '—'}s
    </div>
  )
}
