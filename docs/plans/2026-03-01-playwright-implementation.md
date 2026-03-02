# Playwright Browser Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Playwright infrastructure to the UI package so a browser can be driven against the Vite dev server during development sessions.

**Architecture:** `playwright.config.ts` lives in `ui/` with `webServer` pointing at the Vite dev server. `reuseExistingServer: true` means Playwright attaches to a running `pnpm dev` instance or starts one itself. No spec files yet — the `e2e/` directory is scaffolded and ready. The Go server + data source (fake emitter or M4L) is an external prerequisite started separately.

**Tech Stack:** `@playwright/test`, Vite dev server (port 5173), Taskfile

---

### Task 1: Add Playwright dependency and scripts to `ui/package.json`

**Files:**
- Modify: `ui/package.json`

**Step 1: Add the devDependency and script**

Edit `ui/package.json`. In `devDependencies` add:

```json
"@playwright/test": "^1.50.0"
```

In `scripts` add:

```json
"playwright": "playwright test"
```

Final `scripts` block:

```json
"scripts": {
  "build": "vite build",
  "watch": "vite build --watch",
  "dev": "vite",
  "lint": "eslint src/**/*.ts src/**/*.tsx",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --passWithNoTests",
  "playwright": "playwright test"
}
```

**Step 2: Install dependencies**

Run from the repo root (always use root for pnpm installs):

```bash
pnpm install
```

Expected: lockfile updated, `@playwright/test` appears in `node_modules`.

**Step 3: Install Chromium browser**

```bash
pnpm --filter ui exec playwright install chromium
```

Expected: Chromium downloaded to Playwright's cache directory. One-time setup.

**Step 4: Verify `playwright` command is available**

```bash
pnpm --filter ui exec playwright --version
```

Expected: prints `Version 1.50.x` (or similar).

**Step 5: Commit**

```bash
git add ui/package.json pnpm-lock.yaml
git commit -m "feat(ui): add @playwright/test devDependency"
```

---

### Task 2: Create `ui/playwright.config.ts`

**Files:**
- Create: `ui/playwright.config.ts`

**Step 1: Create the config**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:5173',
  use: {
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
```

**Step 2: Verify TypeScript is happy**

```bash
pnpm --filter ui typecheck
```

Expected: no errors. (`playwright.config.ts` is outside `src/` and not in the tsconfig `include` paths — if tsc complains, check that `tsconfig.json` doesn't glob `*.ts` at the root of `ui/`. The typecheck command uses `tsc --noEmit` which respects `tsconfig.json` includes; the config file only needs to be valid when Playwright runs it, not when tsc lints the app.)

**Step 3: Commit**

```bash
git add ui/playwright.config.ts
git commit -m "feat(ui): add playwright.config.ts"
```

---

### Task 3: Scaffold `ui/e2e/` directory

**Files:**
- Create: `ui/e2e/.gitkeep`

**Step 1: Create the directory**

```bash
mkdir ui/e2e && touch ui/e2e/.gitkeep
```

**Step 2: Commit**

```bash
git add ui/e2e/.gitkeep
git commit -m "feat(ui): scaffold e2e/ directory for Playwright specs"
```

---

### Task 4: Add `playwright` task to Taskfile.yml

**Files:**
- Modify: `Taskfile.yml`

**Step 1: Add task under the Test section**

In `Taskfile.yml`, after the `test:ts` task, add:

```yaml
  playwright:
    desc: Run Playwright browser tests (requires Go server on :3000)
    summary: |
      Starts the Vite dev server if not already running, then runs Playwright.
      Prerequisite: Go server must be running on port 3000.
        task server:dev   # in one terminal
        task fake         # in another terminal (or use M4L)
        task playwright   # in a third terminal
    cmds:
      - pnpm --filter ui playwright test
```

**Step 2: Verify task appears in task list**

```bash
task --list
```

Expected: `playwright` appears with its description.

**Step 3: Verify the task runs (no tests yet — should exit cleanly)**

```bash
task playwright
```

Expected: Playwright starts, finds no test files in `e2e/`, exits with code 0. Output similar to:

```
Running 0 tests using 0 workers
```

Note: this step requires either the Go server to be running on port 3000 (so Vite's WebSocket proxy has a backend) or tolerance for the proxy failing silently. The app will load either way — it just shows the disconnected state if Go isn't running.

**Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat: add playwright task to Taskfile"
```

---

### Task 5: Verify end-to-end (smoke test)

This task is manual verification — no code to write.

**Prerequisite:** Go server running on port 3000, fake emitter sending data.

```bash
task server:dev   # terminal 1
task fake         # terminal 2
task watch:ui     # terminal 3 (start Vite dev server)
```

Then in a fourth terminal or via MCP Playwright plugin, navigate to `http://localhost:5173`.

Expected:
- App loads, Monitor tab visible
- StatusBar shows M4L connected
- Parameters panel shows live values from fake emitter
- `reuseExistingServer: true` means `task playwright` would attach to the already-running Vite server rather than starting a second one

No commits for this task — it is verification only.
