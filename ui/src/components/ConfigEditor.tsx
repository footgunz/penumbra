import { useCallback, useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { AppConfig } from '@/types'
import { UniversesPanel } from './config/UniversesPanel'
import { MappingPanel } from './config/MappingPanel'
import { ZonesPanel } from './config/ZonesPanel'
import { AdvancedPanel } from './config/AdvancedPanel'

export function ConfigEditor() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => {
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`)
        return r.json()
      })
      .then((data: AppConfig) => setConfig(data))
      .catch((e: Error) => setError(e.message))
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

  if (error) {
    return (
      <div className="flex items-center justify-center flex-1 text-error-text text-sm">
        Failed to load config: {error}
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center flex-1 text-text-muted text-sm">
        Loading config…
      </div>
    )
  }

  return (
    <>
      {/* Mobile: show message */}
      <div className="md:hidden flex items-center justify-center flex-1 p-8 text-text-muted text-sm text-center">
        Config editor is available on desktop (768px+).
      </div>

      {/* Desktop: sub-tabbed editor */}
      <div className="hidden md:flex flex-col flex-1 overflow-hidden">
        <Tabs defaultValue="universes" className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-surface px-2 h-10">
            <TabsTrigger value="universes" className="text-xs font-semibold tracking-wider uppercase">
              Universes
            </TabsTrigger>
            <TabsTrigger value="mapping" className="text-xs font-semibold tracking-wider uppercase">
              Mapping
            </TabsTrigger>
            <TabsTrigger value="zones" className="text-xs font-semibold tracking-wider uppercase">
              Zones
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs font-semibold tracking-wider uppercase">
              Advanced
            </TabsTrigger>
          </TabsList>

          <TabsContent value="universes" className="flex-1 overflow-hidden data-[state=active]:flex">
            <UniversesPanel
              universes={config.universes}
              onChange={(universes) => setConfig({ ...config, universes })}
            />
          </TabsContent>

          <TabsContent value="mapping" className="flex-1 overflow-hidden data-[state=active]:flex">
            <MappingPanel
              parameters={config.parameters}
              onChange={(parameters) => setConfig({ ...config, parameters })}
            />
          </TabsContent>

          <TabsContent value="zones" className="flex-1 overflow-hidden data-[state=active]:flex">
            <ZonesPanel />
          </TabsContent>

          <TabsContent value="advanced" className="flex-1 overflow-hidden data-[state=active]:flex">
            <AdvancedPanel
              configJson={JSON.stringify(config, null, 2)}
              onSave={handleAdvancedSave}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
