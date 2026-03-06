import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@lingui/core/macro'
import type { AppConfig, ServerMessage, StatusMessage } from './types'
import { client } from './ws/client'
import { useIsMobile } from '@/hooks/use-mobile'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar, type Section } from './components/AppSidebar'
import { StatusBar } from './components/StatusBar'
import { MonitorPanel } from './components/MonitorPanel'
import { UniversesPanel } from './components/config/UniversesPanel'
import { PatchPanel } from './components/config/PatchPanel'
import { MappingPanel } from './components/config/MappingPanel'
import { ZonesPanel } from './components/config/ZonesPanel'
import { AdvancedPanel } from './components/config/AdvancedPanel'
import { FixturesPanel } from './components/config/FixturesPanel'
import { ScenesPanel } from './components/config/ScenesPanel'
import { EmitterPanel } from './components/config/EmitterPanel'

export function App() {
  // --- Monitor state (WebSocket) ---
  const [params, setParams] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const pendingDiffs = useRef<Record<string, number>>({})

  // --- Navigation ---
  const [section, setSection] = useState<Section>('monitor')
  const [selectedUniverse, setSelectedUniverse] = useState<string | null>(null)

  // --- Config state (HTTP) ---
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)

  // WebSocket setup
  useEffect(() => {
    const wsUrl =
      window.location.protocol === 'https:'
        ? `wss://${window.location.host}/ws`
        : `ws://${window.location.host}/ws`
    client.connect(wsUrl)

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

  // Fetch config on mount
  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`)
        return r.json()
      })
      .then((data: AppConfig) => {
        setConfig(data)
        const keys = Object.keys(data.universes ?? {}).sort((a, b) => Number(a) - Number(b))
        if (keys.length > 0) setSelectedUniverse(keys[0])
      })
      .catch((e: Error) => setConfigError(e.message))
  }, [])

  const saveConfig = useCallback(async (updated: AppConfig) => {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (!r.ok) {
      const text = await r.text()
      throw new Error(text.trim() || `HTTP ${r.status}`)
    }
    setConfig(updated)
  }, [])

  const handleAdvancedSave = useCallback(async (jsonStr: string) => {
    const parsed = JSON.parse(jsonStr) as AppConfig
    await saveConfig(parsed)
  }, [saveConfig])

  // Render the active section's content
  function renderContent() {
    if (section === 'monitor') {
      return <MonitorPanel params={params} status={status} />
    }

    // All config sections need config loaded
    if (configError) {
      return (
        <div className="flex items-center justify-center flex-1 text-error-text text-sm">
          {t`Failed to load config: ${configError}`}
        </div>
      )
    }
    if (!config) {
      return (
        <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
          {t`Loading config…`}
        </div>
      )
    }

    switch (section) {
      case 'universes':
        return (
          <div className="flex flex-1 overflow-hidden">
            <UniversesPanel
              universes={config.universes}
              status={status}
              onChange={(universes) => setConfig({ ...config, universes })}
              onSave={(universes) => saveConfig({ ...config, universes })}
              selectedUniverse={selectedUniverse}
              onSelectUniverse={setSelectedUniverse}
            />
            {selectedUniverse && config.universes[selectedUniverse] && (
              <PatchPanel
                universeId={selectedUniverse}
                universe={config.universes[selectedUniverse]}
                onSave={(patches) => {
                  const updated = {
                    ...config,
                    universes: {
                      ...config.universes,
                      [selectedUniverse]: { ...config.universes[selectedUniverse], patches },
                    },
                  }
                  return saveConfig(updated)
                }}
              />
            )}
          </div>
        )
      case 'fixtures':
        return <FixturesPanel />
      case 'mapping':
        return (
          <MappingPanel
            parameters={config.parameters}
            onChange={(parameters) => setConfig({ ...config, parameters })}
          />
        )
      case 'zones':
        return <ZonesPanel />
      case 'scenes':
        return <ScenesPanel />
      case 'emitter':
        return (
          <EmitterPanel
            emitter={config.emitter}
            onChange={(emitter) => setConfig({ ...config, emitter })}
          />
        )
      case 'advanced':
        return (
          <AdvancedPanel
            configJson={JSON.stringify(config, null, 2)}
            onSave={handleAdvancedSave}
          />
        )
      default: {
        const _exhaustive: never = section
        return _exhaustive
      }
    }
  }

  const isMobile = useIsMobile()

  return (
    <SidebarProvider>
      <div className="min-h-dvh bg-background text-text flex w-full">
        {/* Sidebar — hidden on mobile */}
        {!isMobile && <AppSidebar active={section} onSelect={setSection} />}

        {/* Main content */}
        <main className="flex flex-col flex-1 overflow-hidden">
          <StatusBar status={status} sessionId={sessionId} />

          {isMobile ? (
            /* Mobile: monitor only + config note */
            <div className="flex flex-col flex-1 overflow-hidden">
              <MonitorPanel params={params} status={status} />
              <div className="px-4 py-2 text-center text-text-faint text-xs border-t border-border">
                {t`Configure on desktop or tablet`}
              </div>
            </div>
          ) : (
            /* Desktop/tablet: sidebar-driven content */
            <div className="flex flex-1 overflow-hidden">
              {renderContent()}
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  )
}
