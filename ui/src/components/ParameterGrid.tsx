interface Props {
  params: Record<string, number>
}

export function ParameterGrid({ params }: Props) {
  const entries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b))

  if (entries.length === 0) {
    return <div className="p-6 text-text-faint text-sm">No parameters received yet.</div>
  }

  return (
    <div className="flex flex-col gap-1 p-4 text-sm">
      {entries.map(([name, value]) => (
        <div
          key={name}
          className="grid items-center gap-2 min-h-[44px]"
          style={{ gridTemplateColumns: '12rem 1fr 4rem' }}
        >
          <span className="text-text-dim overflow-hidden text-ellipsis whitespace-nowrap">
            {name}
          </span>
          <div className="h-2.5 bg-bar-track rounded overflow-hidden">
            <div
              className="h-full bg-accent rounded transition-[width] duration-[80ms] ease-linear"
              style={{ width: `${Math.round(value * 100)}%` }}
            />
          </div>
          <span className="text-text-muted text-right">{(value * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}
