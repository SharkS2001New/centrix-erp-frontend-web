#!/usr/bin/env bash
# Stage shop-facing Centrix KRA Agent binaries (no source) into release/win-x64.
# Works on macOS/Linux with .NET 8 SDK (cross-publishes win-x64), or on Windows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/src/Centrix.KraAgent/Centrix.KraAgent.csproj"
PUBLISH="$ROOT/publish"
OUT="${1:-$ROOT/release/win-x64}"

export PATH="${HOME}/.dotnet:${PATH}"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "ERROR: dotnet not found. Install .NET 8 SDK, or:"
  echo "  curl -fsSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 8.0"
  exit 1
fi

echo "=== Publishing Centrix KRA Agent (win-x64, self-contained) ==="
dotnet publish "$PROJECT" \
  -c Release \
  -r win-x64 \
  --self-contained true \
  -p:PublishSingleFile=true \
  -o "$PUBLISH"

EXE="$PUBLISH/Centrix.KraAgent.exe"
if [[ ! -f "$EXE" ]]; then
  echo "ERROR: Missing $EXE after publish."
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
# Prefer rsync; fall back to cp.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --exclude='*.pdb' --exclude='config.example.json' --exclude='config.json' "$PUBLISH/" "$OUT/"
else
  cp -R "$PUBLISH/." "$OUT/"
  rm -f "$OUT"/*.pdb "$OUT/config.example.json" "$OUT/config.json" 2>/dev/null || true
fi

cp "$ROOT/scripts/install-windows-service.ps1" "$OUT/"
cp "$ROOT/scripts/uninstall-windows-service.ps1" "$OUT/"

cat > "$OUT/INSTALL.bat" <<'EOF'
@echo off
:: Centrix KRA Agent — run as Administrator (no .NET SDK required)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows-service.ps1"
if errorlevel 1 pause
EOF

cat > "$OUT/uninstall.bat" <<'EOF'
@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-windows-service.ps1"
if errorlevel 1 pause
EOF

echo ""
echo "Staged installer at:"
echo "  $OUT"
echo "Finance → Download Centrix KRA Agent will zip this folder with config.json."
echo "For production, deploy this folder with the web app (or set KRA_AGENT_RELEASE_DIR)."
