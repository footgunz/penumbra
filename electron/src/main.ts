import {
  app,
  BrowserWindow,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
} from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'
const serverMode = process.env.SERVER_MODE ?? 'local'
const remoteUrl = process.env.REMOTE_URL ?? 'http://localhost:3000'
const localPort = process.env.WS_PORT ?? '3000'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcess | null = null

// ─── Server ───────────────────────────────────────────────────────────────────

function spawnServer(): void {
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'ableton-dmx-server')
    : path.join(__dirname, '../../server/ableton-dmx-server')

  serverProcess = spawn(bin, [], {
    env: { ...process.env, WS_PORT: localPort },
    stdio: 'inherit',
  })
  serverProcess.on('error', (err) => console.error('Server error:', err))
}

// ─── Window ───────────────────────────────────────────────────────────────────

function getAppUrl(): string {
  if (isDev) return `http://localhost:5173`
  if (serverMode === 'remote') return remoteUrl
  return `http://localhost:${localPort}`
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      // No preload needed — all data flows through WebSocket to Go
      // Only IPC needed is hotkey forwarding
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL(getAppUrl())
  win.on('closed', () => { win = null })
}

// ─── Global Hotkeys ───────────────────────────────────────────────────────────

// Register hotkeys that fire even when the window is not focused.
// Events are forwarded to the renderer as synthetic hotkey events —
// identical to keyboard shortcut events in the browser.
function registerHotkeys(): void {
  const hotkeys: Record<string, string> = {
    'CommandOrControl+1': 'scene-1',
    'CommandOrControl+2': 'scene-2',
    'CommandOrControl+3': 'scene-3',
    'CommandOrControl+4': 'scene-4',
    'CommandOrControl+0': 'blackout',
  }

  for (const [accelerator, key] of Object.entries(hotkeys)) {
    globalShortcut.register(accelerator, () => {
      win?.webContents.send('hotkey', key)
    })
  }
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function createTray(): void {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../assets/tray-icon.png')
  )
  tray = new Tray(icon)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => win?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]))
  tray.on('click', () => win?.show())
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (serverMode === 'local') {
    spawnServer()
    setTimeout(() => {
      createWindow()
      createTray()
      registerHotkeys()
    }, 500)
  } else {
    createWindow()
    createTray()
    registerHotkeys()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (!win) createWindow()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  serverProcess?.kill()
})
