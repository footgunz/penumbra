package main

import "embed"

// ui holds the compiled Vite/React PWA bundle.
// Built from ui/dist/ and embedded at compile time.
// In dev mode the Go server proxies to Vite's dev server instead.
//
//go:embed ui/dist
var ui embed.FS
