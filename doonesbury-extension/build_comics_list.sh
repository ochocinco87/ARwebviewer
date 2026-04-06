#!/usr/bin/env bash
# Scans the comics/ folder and generates comics_list.js
# Run this after adding/removing comic images.

set -euo pipefail
cd "$(dirname "$0")"

FILES=()
for f in comics/*.{png,jpg,jpeg,gif,webp,bmp} 2>/dev/null; do
  [ -f "$f" ] && FILES+=("\"$f\"")
done

{
  echo "// Auto-generated list of comic files. Re-run build_comics_list.sh to update."
  if [ ${#FILES[@]} -eq 0 ]; then
    echo "const COMICS = [];"
  else
    echo "const COMICS = ["
    for i in "${!FILES[@]}"; do
      if [ "$i" -lt $((${#FILES[@]} - 1)) ]; then
        echo "  ${FILES[$i]},"
      else
        echo "  ${FILES[$i]}"
      fi
    done
    echo "];"
  fi
} > comics_list.js

echo "Generated comics_list.js with ${#FILES[@]} comics."
