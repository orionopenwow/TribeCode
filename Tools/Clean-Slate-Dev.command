#!/bin/bash
# TribeCode clean slate: a throwaway local tribe folder (~/TribeCode-Dev, wiped each run), signed in as a local guest,
# no tribe yet, live reload on. Double-click in Finder; add --keep (from a terminal) to keep last time's folder.
# Docs: docs/DEV-TOOLS.md
cd "$(dirname "$0")/.." || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is needed: https://nodejs.org"; read -r -p "Press Enter to close"; exit 1; }
exec node scripts/dev/clean-slate.js "$@"
