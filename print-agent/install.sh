#!/usr/bin/env bash
# One-time setup for a Centrix till PC (macOS / Linux).
# Usage: ./install.sh
#        ./install.sh --autostart
#
# Installs portable Node.js 20+ when system Node is missing or too old.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"
AUTOSTART=false

for arg in "$@"; do
  if [[ "$arg" == "--autostart" ]]; then
    AUTOSTART=true
  fi
done

NODE_VERSION="$(tr -d '[:space:]' < "${DIR}/node-version.txt")"
if [[ -z "$NODE_VERSION" ]]; then
  NODE_VERSION="20.18.0"
fi

node_platform_id() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      if [[ "$arch" == "arm64" ]]; then echo "darwin-arm64"; else echo "darwin-x64"; fi
      ;;
    Linux)
      if [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then echo "linux-arm64"; else echo "linux-x64"; fi
      ;;
    *)
      echo "unsupported" >&2
      return 1
      ;;
  esac
}

system_node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -p "process.versions.node.split('.')[0]")"
  [[ "$major" -ge 20 ]]
}

bundled_node_dir() {
  local platform folder
  platform="$(node_platform_id)"
  folder="node-v${NODE_VERSION}-${platform}"
  if [[ -x "${DIR}/runtime/${folder}/bin/node" ]]; then
    echo "${DIR}/runtime/${folder}"
    return 0
  fi
  return 1
}

install_portable_node() {
  local platform folder url runtime
  platform="$(node_platform_id)"
  folder="node-v${NODE_VERSION}-${platform}"
  runtime="${DIR}/runtime"
  url="https://nodejs.org/dist/v${NODE_VERSION}/${folder}.tar.gz"

  echo "==> No suitable Node.js found — downloading portable Node.js ${NODE_VERSION} (${platform})…"
  mkdir -p "$runtime"
  curl -fsSL "$url" -o "${runtime}/node.tar.gz"
  tar -xzf "${runtime}/node.tar.gz" -C "$runtime"
  rm "${runtime}/node.tar.gz"
  echo "==> Portable Node.js installed at ${runtime}/${folder}"
  echo "${runtime}/${folder}"
}

initialize_node_path() {
  if system_node_ok; then
    echo "==> Using system Node.js $(node -v)"
    NODE_EXE="node"
    NPM_EXE="npm"
    NPX_EXE="npx"
    return
  fi

  local node_dir
  if node_dir="$(bundled_node_dir)"; then
    echo "==> Using bundled Node.js from ${node_dir}"
  else
    node_dir="$(install_portable_node)"
  fi

  export PATH="${node_dir}/bin:${PATH}"
  NODE_EXE="${node_dir}/bin/node"
  NPM_EXE="${node_dir}/bin/npm"
  NPX_EXE="${node_dir}/bin/npx"
}

initialize_node_path

echo "==> Installing Centrix Print Agent dependencies…"
"$NPM_EXE" install
echo "==> Installing Playwright Chromium (used for receipt rendering)…"
"$NPX_EXE" playwright install chromium

if [[ "$AUTOSTART" == true ]]; then
  START_SCRIPT="$DIR/start-agent.sh"
  cat > "$START_SCRIPT" <<EOF
#!/usr/bin/env bash
cd "$DIR"
exec "$NODE_EXE" server.js
EOF
  chmod +x "$START_SCRIPT"

  if [[ "$(uname -s)" == "Darwin" ]]; then
    PLIST="$HOME/Library/LaunchAgents/com.centrix.print-agent.plist"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.centrix.print-agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$START_SCRIPT</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "==> Registered auto-start (macOS LaunchAgent)."
  else
    AUTOSTART_DIR="$HOME/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    cat > "$AUTOSTART_DIR/centrix-print-agent.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Centrix Print Agent
Exec=$START_SCRIPT
X-GNOME-Autostart-enabled=true
EOF
    echo "==> Registered auto-start (~/.config/autostart)."
  fi
fi

echo ""
echo "Done. Start the agent with:"
if [[ "$AUTOSTART" == true ]]; then
  echo "  $START_SCRIPT"
else
  echo "  cd \"$DIR\" && \"$NODE_EXE\" server.js"
fi
echo ""
echo "Then in Centrix ERP: Administration → Till printing → enable agent → Test print receipt."
