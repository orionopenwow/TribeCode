#!/usr/bin/env bash
# Commit, tag and push a TribeCode version milestone.
# Usage: ./scripts/milestone.sh v0.1.0 "Short milestone title"
set -euo pipefail

VERSION="${1:?usage: milestone.sh <version> <title>}"
TITLE="${2:?usage: milestone.sh <version> <title>}"
DATE="$(date +%Y-%m-%d)"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null; then
  echo "Tag $VERSION already exists" >&2; exit 1
fi

# Keep the desktop app version in step with the milestone tag (the updater compares these).
SEMVER="${VERSION#v}"
if [[ "$SEMVER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  [ -f app/src-tauri/tauri.conf.json ] && sed -i.bak -E "0,/\"version\": \"[^\"]+\"/s//\"version\": \"$SEMVER\"/" app/src-tauri/tauri.conf.json
  [ -f app/src-tauri/Cargo.toml ] && sed -i.bak -E "0,/^version = \"[^\"]+\"/s//version = \"$SEMVER\"/" app/src-tauri/Cargo.toml
  [ -f app/package.json ] && sed -i.bak -E "0,/\"version\": \"[^\"]+\"/s//\"version\": \"$SEMVER\"/" app/package.json
  rm -f app/src-tauri/tauri.conf.json.bak app/src-tauri/Cargo.toml.bak app/package.json.bak
fi

# Changes since the previous tag become the changelog entry.
PREV="$(git describe --tags --abbrev=0 2>/dev/null || true)"
if [ -n "$PREV" ]; then RANGE="$PREV..HEAD"; else RANGE="HEAD"; fi
CHANGES="$(git log --pretty='- %s' $RANGE 2>/dev/null | grep -v '^- Milestone ' || true)"

ENTRY="## $VERSION: $TITLE ($DATE)"$'\n\n'"${CHANGES:-- Initial milestone}"$'\n'
if [ -f CHANGELOG.md ]; then
  { head -n 2 CHANGELOG.md; echo; echo "$ENTRY"; tail -n +3 CHANGELOG.md; } > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md
else
  printf '# Changelog\n\n%s' "$ENTRY" > CHANGELOG.md
fi

git add -A
git commit -m "Milestone $VERSION: $TITLE"
git tag -a "$VERSION" -m "$TITLE"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git push origin "$BRANCH"
git push origin "$VERSION"
echo "Milestone $VERSION pushed. GitHub Actions is now building installers; running apps will show \"Restart to update\" once the release is published."
