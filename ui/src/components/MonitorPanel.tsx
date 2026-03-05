import type { StatusMessage } from '@/types'
import { ParameterGrid } from './ParameterGrid'
import { UniverseList } from './UniverseList'

interface MonitorPanelProps {
  params: Record<string, number>
  status: StatusMessage | null
}

export function MonitorPanel({ params, status }: MonitorPanelProps) {
  return (
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
      <section className="flex-1 overflow-y-auto border-b md:border-b-0 md:border-r border-border">
        <h2 className="sticky top-0 z-10 bg-background px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-dim border-b border-border">
          Parameters
        </h2>
        <ParameterGrid params={params} />
      </section>
      <section className="flex-1 overflow-y-auto">
        <h2 className="sticky top-0 z-10 bg-background px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-dim border-b border-border">
          Universes
        </h2>
        <UniverseList status={status} />
      </section>
    </div>
  )
}
