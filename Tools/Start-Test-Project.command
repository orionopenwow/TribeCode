#!/bin/bash
# macOS/Linux: double-click (macOS) or run Tools/Start-Test-Project.command
cd "$(dirname "$0")"
[ -f ../server/index.js ] && cd ..   # in the repo this file lives in Tools/
command -v node >/dev/null || { echo "TribeCode needs Node.js: https://nodejs.org"; open https://nodejs.org 2>/dev/null; exit 1; }
command -v git >/dev/null || { echo "TribeCode needs Git: https://git-scm.com"; exit 1; }
if [ ! -f server/index.js ]; then
  [ -f TribeCode/server/index.js ] || git clone https://github.com/orionopenwow/TribeCode.git TribeCode || exit 1
  cd TribeCode
fi
git pull --ff-only --quiet
exec node scripts/start-test-project.js
