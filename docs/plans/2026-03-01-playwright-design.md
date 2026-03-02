# Playwright Browser Integration — Design

**Date:** 2026-03-01
**Status:** Approved

---

## Purpose

Add Playwright to the UI package as a **development aid**, not a CI test suite. The goal is to let Claude drive a browser against the running app during implementation sessions — navigating pages, verifying component rendering, and confirming UI changes work end-to-end — without needing to write or maintain spec files.

---

## Scope

- Playwright infrastructure only: config, dependency, empty `e2e/` directory
- No spec files now — directory is ready if they're added later
- Not added to CI
- No mock WebSocket server — the real Go server + fake emitter (or M4L) is the expected data source

---

## Dev Stack Topology

```
Go server (port 3000)  ←  fake emitter or M4L (UDP)
       ↑
Vite dev server (port 5173)  —  proxies /ws and /api → Go
       ↑
Playwright (MCP plugin)  —  navigates to http://localhost:5173
```

Go server is started externally. Playwright and the Vite dev server are coupled.

---

## Key Design Decision: Coupled Startup

The Vite dev server and Playwright are treated as a unit. When the dev server is running, a Playwright browser connection is expected and valid. The mechanism is `webServer` with `reuseExistingServer: true`:

- If Vite is already running: Playwright attaches to it
- If Vite is not running: Playwright starts it
- Either way, Playwright can always connect when the dev environment is up

---

## Implementation

### `ui/playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:5173',
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

### `ui/package.json`

Add `@playwright/test` as a devDependency. Add a `playwright` script:

```json
"playwright": "playwright test"
```

### `ui/e2e/`

Empty directory with a `.gitkeep`. Ready for spec files when needed.

### `Taskfile.yml`

A `playwright` task that starts Vite and opens Playwright. Since `reuseExistingServer: true`, running `task watch:ui` first and then `task playwright` separately is also valid.

---

## What Is Not Included

- CI integration — Playwright does not run on PRs
- Mock WebSocket server — real Go server required
- Spec files — infrastructure only
- Browser installation automation — `pnpm playwright install` run manually once
