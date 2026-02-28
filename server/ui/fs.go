// Package ui exposes the compiled Vite/React PWA bundle for embedding.
// The dist/ directory is produced by `pnpm --filter ui build` (output: server/ui/dist/).
// Imported by server/api so it can serve the UI without depending on the main package.
package ui

import "embed"

//go:embed dist
var FS embed.FS
