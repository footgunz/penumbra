#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-device.amxd}"

if [ ! -f "$INPUT" ]; then
  echo "Error: $INPUT not found."
  exit 1
fi

echo "Unpacking $INPUT into device/..."
cp "$INPUT" device.zip
unzip -o device.zip -d device/
rm device.zip
echo "Done."
