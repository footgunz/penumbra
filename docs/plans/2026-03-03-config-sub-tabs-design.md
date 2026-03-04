# Design: Config Sub-Tab Navigation (Issue #31)

## Summary

Restructure the Configure tab from a single JSON editor into a sub-tabbed layout with shared config state. Four sub-tabs: Universes, Mapping, Zones, Advanced (JSON editor).

## Component Structure

```
App.tsx
  └─ TabsContent "configure"
       └─ <ConfigEditor>              ← refactored container
            ├─ fetches config on mount (GET /api/config)
            ├─ holds typed state: { universes, parameters, zones }
            ├─ <Tabs> sub-tab bar
            │    Universes | Mapping | Zones | Advanced
            │
            ├─ <UniversesPanel />   ← stub
            ├─ <MappingPanel />     ← stub
            ├─ <ZonesPanel />       ← stub
            └─ <AdvancedPanel />    ← existing CodeMirror editor
```

## State & Data Flow

- `ConfigEditor` owns a single `config` state object typed against protocol-types.
- Each stub panel receives its slice (e.g., `config.universes`) and an `onChange` callback that merges back into parent state.
- `AdvancedPanel` gets the full config object and operates as the current JSON editor — serializes to/from JSON text, validates, saves via parent.
- Save goes through a shared `saveConfig()` in the parent that POSTs to `/api/config`.

## Sub-Tab Styling

- Uses existing shadcn `<Tabs>` with `variant="default"` (boxed) to distinguish from top-level `variant="line"` tabs.

## Stub Panels

Each stub accepts typed props (config slice + onChange) so the interface is ready for issues #14, #16, and zones. Renders a placeholder message.

## Files

| File | Change |
|------|--------|
| `ui/src/components/ConfigEditor.tsx` | Refactor to container with sub-tabs |
| `ui/src/components/config/UniversesPanel.tsx` | New stub |
| `ui/src/components/config/MappingPanel.tsx` | New stub |
| `ui/src/components/config/ZonesPanel.tsx` | New stub |
| `ui/src/components/config/AdvancedPanel.tsx` | New — extracted CodeMirror editor |

No server changes. No new dependencies. Protocol types unchanged.
