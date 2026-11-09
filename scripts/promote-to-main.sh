#!/usr/bin/env bash
# Local helper: run Web CI gates, then rebase master onto main, FF main, and
# sync master to the same tip. Prefer the promote job inside Web CI for routine
# pushes; use this for a one-off sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "master" ]]; then
  echo "Switch to master before promoting (currently on ${BRANCH})." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash before promoting." >&2
  exit 1
fi

echo "==> Running Web CI gates (lint / unit / permissions / build; e2e stays on Actions)"
bash scripts/npm-audit-ci.sh
npm run lint
npm test
node scripts/check-permission-codes.mjs scripts/permission-registry.snapshot.json
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000/api/v1}" npm run build

echo "==> Fetching remotes"
git fetch origin master main

MASTER_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main)"

echo "==> Comparing branches before promote"
echo "main:   ${MAIN_SHA}"
echo "master: ${MASTER_SHA}"

echo ""
echo "==> Commits only on main (must be preserved)"
git log --oneline "${MASTER_SHA}..${MAIN_SHA}" || true

echo ""
echo "==> Commits only on master (will replay onto main)"
git log --oneline "${MAIN_SHA}..${MASTER_SHA}" || true

if [[ "${MASTER_SHA}" == "${MAIN_SHA}" ]]; then
  echo "master and main already aligned at ${MASTER_SHA:0:7}"
  exit 0
fi

if git merge-base --is-ancestor "${MASTER_SHA}" "${MAIN_SHA}"; then
  git push origin "${MAIN_SHA}:refs/heads/master"
  git checkout master
  git reset --hard "${MAIN_SHA}"
  echo "Synced master → ${MAIN_SHA:0:7} (ff-only; main was ahead)"
  exit 0
fi

git checkout -B promote-temp "${MASTER_SHA}"

if ! git rebase "${MAIN_SHA}"; then
  git rebase --abort || true
  git checkout master
  echo "Rebase conflict promoting master onto main. Resolve manually (never force-push main)." >&2
  exit 1
fi

PROMOTE_SHA="$(git rev-parse HEAD)"

if ! git merge-base --is-ancestor "${MAIN_SHA}" "${PROMOTE_SHA}"; then
  git checkout master
  git branch -D promote-temp 2>/dev/null || true
  echo "Aborting: rebase result lost commits from main (${MAIN_SHA:0:7}). Nothing pushed." >&2
  exit 1
fi

if [[ "${PROMOTE_SHA}" == "${MAIN_SHA}" ]]; then
  git checkout master
  git branch -D promote-temp 2>/dev/null || true
  echo "Aborting: promote tip equals old main; unexpected empty promote." >&2
  exit 1
fi

echo ""
echo "==> Rebase result (main preserved + master replayed)"
git log --oneline "${MAIN_SHA}..${PROMOTE_SHA}"

git checkout -B main "${MAIN_SHA}"
git merge --ff-only "${PROMOTE_SHA}"
git push origin main

git push --force-with-lease=refs/heads/master:"${MASTER_SHA}" \
  origin "${PROMOTE_SHA}:refs/heads/master"

git checkout master
git reset --hard "${PROMOTE_SHA}"
git branch -D promote-temp 2>/dev/null || true
echo "==> Done. master and main aligned at $(git rev-parse --short HEAD) (main ff-only; no force on main)"
