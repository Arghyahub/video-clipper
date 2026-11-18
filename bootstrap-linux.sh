#!/usr/bin/env bash
# Sets up GTA 6 Clip Studio on Debian/Ubuntu, Fedora, Arch, or Alpine Linux.
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$project_dir"

say() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1; }
sudo_cmd=()
if [[ $(id -u) -ne 0 ]]; then sudo_cmd=(sudo); fi

install_system_packages() {
  say "Installing FFmpeg, Python tooling, fonts, curl, and unzip"
  if need apt-get; then "${sudo_cmd[@]}" apt-get update; "${sudo_cmd[@]}" apt-get install -y ffmpeg python3 python3-venv python3-pip curl unzip fontconfig
  elif need dnf; then "${sudo_cmd[@]}" dnf install -y ffmpeg-free python3 python3-pip curl unzip fontconfig
  elif need pacman; then "${sudo_cmd[@]}" pacman -Sy --needed --noconfirm ffmpeg python python-pip curl unzip fontconfig
  elif need apk; then "${sudo_cmd[@]}" apk add ffmpeg python3 py3-pip curl unzip fontconfig
  else echo "No supported package manager found. Install ffmpeg, python3, python3-venv/pip, curl, unzip, and fontconfig manually." >&2; exit 1; fi
}

if ! need python3 || ! need unzip || ! need curl; then install_system_packages; fi

if ! need node || [[ $(node -p 'process.versions.node.split(".")[0]') -lt 20 ]]; then
  say "Installing Node.js 22 LTS with nvm"
  nvm_dir="$HOME/.nvm"
  if [[ ! -s "$nvm_dir/nvm.sh" ]]; then
    installer="$(mktemp)"; curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh -o "$installer"; bash "$installer"; rm -f "$installer"
  fi
  # shellcheck disable=SC1090
  source "$nvm_dir/nvm.sh"; nvm install 22; nvm alias default 22
fi

say "Enabling pnpm"
if ! need pnpm; then corepack enable; corepack prepare pnpm@10.26.2 --activate; fi

say "Creating local captioning environment"
if [[ ! -x .venv/bin/python ]]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install --upgrade faster-whisper

tdl="$project_dir/.tools/TwitchDownloaderCLI"
if [[ ! -x "$tdl" ]]; then
  say "Downloading TwitchDownloaderCLI"
  mkdir -p .tools
  case "$(uname -m)" in x86_64) asset_suffix="Linux-x64.zip";; aarch64|arm64) asset_suffix="LinuxArm64.zip";; *) echo "Unsupported CPU: $(uname -m). Download TwitchDownloaderCLI manually." >&2; exit 1;; esac
  release_json="$(mktemp)"; archive="$(mktemp --suffix=.zip)"
  curl -fsSL https://api.github.com/repos/lay295/TwitchDownloader/releases/latest -o "$release_json"
  asset_url="$(grep -oE 'https://[^"]+' "$release_json" | grep "$asset_suffix" | head -n1)"
  [[ -n "$asset_url" ]] || { echo "Could not find a Linux TwitchDownloader asset." >&2; exit 1; }
  curl -fL "$asset_url" -o "$archive"; unzip -oq "$archive" -d .tools/twitch-downloader
  candidate="$(find .tools/twitch-downloader -type f -name TwitchDownloaderCLI | head -n1)"; [[ -n "$candidate" ]] || { echo "Downloaded archive did not contain TwitchDownloaderCLI." >&2; exit 1; }
  cp "$candidate" "$tdl"; chmod +x "$tdl"; rm -f "$release_json" "$archive"
fi

ffmpeg_bin="$(command -v ffmpeg || true)"
if [[ -z "$ffmpeg_bin" ]]; then
  say "Downloading a project-local FFmpeg through TwitchDownloaderCLI"
  mkdir -p .tools/ffmpeg
  (cd .tools/ffmpeg && "$tdl" ffmpeg --download)
  ffmpeg_bin="$(find .tools/ffmpeg -type f -name ffmpeg | head -n1)"; [[ -n "$ffmpeg_bin" ]] || { echo "TwitchDownloaderCLI could not download FFmpeg." >&2; exit 1; }
  chmod +x "$ffmpeg_bin"
fi

say "Writing local tool configuration"
cat > .env <<EOF
TWITCH_DOWNLOADER=$tdl
PYTHON_BIN=$project_dir/.venv/bin/python
FFMPEG_BIN=$ffmpeg_bin
EOF

say "Installing JavaScript dependencies and building the dashboard"
pnpm install
pnpm build

say "Setup complete"
echo "Run: pnpm dev"
echo "Then open: http://localhost:5173"
