#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="device/scripts"
PATCH_DIR="device"
OUTPUT="device.amxd"

if [ ! -f "$SCRIPTS_DIR/dist/main.js" ]; then
  echo "Error: dist/main.js not found. Run 'pnpm build' first."
  exit 1
fi

echo "Packing $OUTPUT..."
cd "$PATCH_DIR"
zip -r "../$OUTPUT" . -x "scripts/src/*" -x "scripts/node_modules/*" -x "scripts/*.json" -x "scripts/*.mjs" -x "Makefile"
cd ..
echo "Done: $OUTPUT"
