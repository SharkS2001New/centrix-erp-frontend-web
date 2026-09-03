#!/usr/bin/env bash
# Run npm audit for CI. Retries transient registry outages (503 / network);
# still fails the job on real high-severity findings.
set -uo pipefail

AUDIT_LEVEL="${NPM_AUDIT_LEVEL:-high}"
MAX_ATTEMPTS="${NPM_AUDIT_RETRIES:-5}"
SLEEP_BASE_SEC="${NPM_AUDIT_RETRY_SLEEP:-15}"

is_transient_registry_failure() {
  local log="$1"
  grep -qiE \
    '503[[:space:]]+Service Unavailable|Service Unavailable|audit endpoint returned an error|ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|socket hang up|network timeout|fetch failed' \
    <<<"$log"
}

attempt=1
while (( attempt <= MAX_ATTEMPTS )); do
  set +e
  output="$(npm audit --audit-level="$AUDIT_LEVEL" 2>&1)"
  code=$?
  set -e
  printf '%s\n' "$output"

  if (( code == 0 )); then
    exit 0
  fi

  if is_transient_registry_failure "$output"; then
    if (( attempt == MAX_ATTEMPTS )); then
      echo "::warning::npm audit registry unavailable after ${MAX_ATTEMPTS} attempts — skipping (not a package vulnerability)."
      exit 0
    fi
    sleep_for=$(( attempt * SLEEP_BASE_SEC ))
    echo "npm audit registry glitch (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${sleep_for}s..."
    sleep "$sleep_for"
    attempt=$(( attempt + 1 ))
    continue
  fi

  # Real audit findings (or unexpected npm error) — fail the job.
  exit "$code"
done
