import { useEffect, useRef, useState } from 'react'
import type { ServerMessage, StatusMessage } from './types'
import { client } from './ws/client'
import { StatusBar } from './components/StatusBar'
import { ParameterGrid } from './components/ParameterGrid'
import { UniverseList } from './components/UniverseList'
import { ConfigEditor } from './components/ConfigEditor'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

type Tab = 'monitor' | 'configure'

export function App() {
  const [params, setParams] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('monitor')
  const pendingDiffs = useRef<Record<string, number>>({})

  useEffect(() => {
    const wsUrl =
      window.location.protocol === 'https:'
        ? `wss://${window.location.host}/ws`
        : `ws://${window.location.host}/ws`
    client.connect(wsUrl)

    // Flush buffered diffs at 100ms — longer than the 80ms CSS bar transition so
    // animations complete cleanly between updates and the text is readable.
    const flushInterval = setInterval(() => {
      const pending = pendingDiffs.current
      if (Object.keys(pending).length > 0) {
        pendingDiffs.current = {}
        setParams((prev) => ({ ...prev, ...pending }))
      }
    }, 100)

    const unsub = client.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'state':
          pendingDiffs.current = {}
          setSessionId(msg.session_id)
          setParams(msg.state)
          break
        case 'diff':
          Object.assign(pendingDiffs.current, msg.changes)
          break
        case 'session':
          pendingDiffs.current = {}
          setSessionId(msg.session_id)
          setParams({})
          break
        case 'status':
          setStatus(msg)
          break
      }
    })

    return () => {
      unsub()
      clearInterval(flushInterval)
    }
  }, [])

  return (
    <div className="min-h-dvh bg-background text-text flex flex-col">
      <StatusBar status={status} sessionId={sessionId} />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex flex-col flex-1 overflow-hidden"
      >
        {/* Desktop tab bar — top, hidden on mobile */}
        <TabsList
          variant="line"
          className="hidden md:flex w-full justify-start rounded-none border-b border-border bg-background px-2 h-10"
        >
          <TabsTrigger value="monitor" className="uppercase tracking-wider text-xs font-semibold">
            Monitor
          </TabsTrigger>
          <TabsTrigger value="configure" className="uppercase tracking-wider text-xs font-semibold">
            Configure
          </TabsTrigger>
        </TabsList>

        {/* Monitor tab */}
        <TabsContent
          value="monitor"
          className="flex-col md:flex-row flex-1 overflow-hidden pb-14 md:pb-0 data-[state=active]:flex"
        >
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
        </TabsContent>

        {/* Configure tab */}
        <TabsContent
          value="configure"
          className="flex-1 overflow-hidden pb-14 md:pb-0 data-[state=active]:flex"
        >
          <ConfigEditor />
        </TabsContent>

        {/* Mobile tab bar — bottom, fixed, hidden on desktop */}
        <TabsList
          variant="line"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex w-full rounded-none border-t border-border bg-surface h-14 px-2"
        >
          <TabsTrigger
            value="monitor"
            className="flex-1 uppercase tracking-wider text-xs font-semibold"
          >
            Monitor
          </TabsTrigger>
          <TabsTrigger
            value="configure"
            className="flex-1 uppercase tracking-wider text-xs font-semibold"
          >
            Configure
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
