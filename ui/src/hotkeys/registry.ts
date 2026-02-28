import { client } from '../ws/client'
import type { ServerMessage } from '../types'

type HotkeyHandler = (key: string) => void

const handlers: Map<string, HotkeyHandler[]> = new Map()

// registerHotkey registers a handler for a specific key string.
// Returns an unsubscribe function.
export function registerHotkey(key: string, handler: HotkeyHandler): () => void {
  if (!handlers.has(key)) handlers.set(key, [])
  handlers.get(key)!.push(handler)
  return () => {
    const list = handlers.get(key)
    if (list) {
      const idx = list.indexOf(handler)
      if (idx !== -1) list.splice(idx, 1)
    }
  }
}

// fireHotkey dispatches a hotkey event to all registered handlers.
export function fireHotkey(key: string): void {
  const list = handlers.get(key)
  if (list) {
    for (const h of list) h(key)
  }
}

// Listen for hotkey messages forwarded from the server (e.g. external integrations).
// Cast through unknown since HotkeyMessage is a UI→server type not in ServerMessage union.
client.onMessage((msg: ServerMessage) => {
  const raw = msg as unknown as { type: string; key?: string }
  if (raw.type === 'hotkey' && raw.key) {
    fireHotkey(raw.key)
  }
})

// Map keyboard events to hotkey strings
const keyMap: Record<string, string> = {
  '1': 'scene-1',
  '2': 'scene-2',
  '3': 'scene-3',
  '4': 'scene-4',
  '0': 'blackout',
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    // Only fire when no modifier except Ctrl/Meta (matches Electron accelerators)
    if (e.altKey) return
    const key = keyMap[e.key]
    if (key) {
      e.preventDefault()
      fireHotkey(key)
    }
  })
}
