import { t } from '@lingui/core/macro'
import {
  Activity,
  Globe,
  Lightbulb,
  Cable,
  Map,
  Clapperboard,
  Radio,
  Code,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarTrigger,
} from '@/components/ui/sidebar'

export type Section =
  | 'monitor'
  | 'universes'
  | 'fixtures'
  | 'mapping'
  | 'zones'
  | 'scenes'
  | 'emitter'
  | 'advanced'

function configItems(): { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] {
  return [
    { id: 'universes', label: t`Universes`, icon: Globe },
    { id: 'fixtures', label: t`Fixtures`, icon: Lightbulb },
    { id: 'mapping', label: t`Channel Mapping`, icon: Cable },
    { id: 'zones', label: t`Zones`, icon: Map },
    { id: 'scenes', label: t`Scenes`, icon: Clapperboard },
  ]
}

function systemItems(): { id: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] {
  return [
    { id: 'emitter', label: t`Emitter`, icon: Radio },
    { id: 'advanced', label: t`Advanced`, icon: Code },
  ]
}

interface AppSidebarProps {
  active: Section
  onSelect: (section: Section) => void
}

export function AppSidebar({ active, onSelect }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex flex-row items-center gap-2 px-3 py-2">
        <span className="text-sm font-bold tracking-wider uppercase text-text group-data-[collapsible=icon]:hidden">
          Penumbra
        </span>
        <SidebarTrigger className="ml-auto" />
      </SidebarHeader>

      <SidebarContent>
        {/* Monitor — standalone */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={active === 'monitor'}
                onClick={() => onSelect('monitor')}
                tooltip={t`Monitor`}
              >
                <Activity />
                <span>{t`Monitor`}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Config sections */}
        <SidebarGroup>
          <SidebarGroupLabel>{t`Configuration`}</SidebarGroupLabel>
          <SidebarMenu>
            {configItems().map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={active === item.id}
                  onClick={() => onSelect(item.id)}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* System sections */}
        <SidebarGroup>
          <SidebarGroupLabel>{t`System`}</SidebarGroupLabel>
          <SidebarMenu>
            {systemItems().map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={active === item.id}
                  onClick={() => onSelect(item.id)}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
