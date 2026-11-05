#!/usr/bin/env bash
# Quiet test copies of the app for automated checks. Each NAME gets its own data
# folder (.devdata/NAME), runs off screen, never takes focus, logs notifications.
#   bash tools/dev.sh start NAME         start (restarts if running), waits until ready
#   bash tools/dev.sh stop NAME          stop it
#   bash tools/dev.sh shot NAME FILE     window screenshot (PNG)
#   bash tools/dev.sh js NAME 'CODE'     run JS in the renderer, prints the result
#   bash tools/dev.sh key NAME KEY MODS  real key press, e.g. key K control,shift
#   bash tools/dev.sh open NAME DIR      open a Claude session on DIR (no prompt is sent)
#   bash tools/dev.sh api NAME CMD 'QUERY'   any GET /api command (list, screen, log...)
# DEV_ELECTRON_ARGS adds Electron/Chromium flags, e.g. --force-device-scale-factor=2 for 2x shots.
# Claude sessions started here use Haiku (cheap) and must not be sent prompts unless a
# check truly needs one; keep any prompt to a few words.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
cmd=$1; name=$2; dir="$root/.devdata/$name"; json="$dir/server.json"
enc() { node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"; }
port() { sed 's/.*"port":\([0-9]*\).*/\1/' "$json"; }
token() { sed 's/.*"token":"\([a-f0-9]*\)".*/\1/' "$json"; }
pid() { sed 's/.*"pid":\([0-9]*\).*/\1/' "$json"; }
get() { curl -s -m 20 "http://127.0.0.1:$(port)/api/$(token)/$1?$2"; }
stop() { if [ -f "$json" ]; then taskkill //F //T //PID "$(pid)" >/dev/null 2>&1 || kill "$(pid)" 2>/dev/null || true; rm -f "$json"; sleep 1; fi; }
case "$cmd" in
  start)
    stop; mkdir -p "$dir"
    (cd "$root" && HANGAR_DEV=1 HANGAR_DEV_OFFSCREEN=1 HANGAR_DATA_DIR="$dir" HANGAR_DEV_CLAUDE_ARGS="${DEV_CLAUDE_ARGS:---model haiku}" \
      npx electron . --mute-audio ${DEV_ELECTRON_ARGS:-} > "$dir/run.log" 2>&1 &)
    for i in $(seq 1 40); do [ -f "$json" ] && break; sleep 1; done
    [ -f "$json" ] || { echo "did not start, see $dir/run.log"; exit 1; }
    sleep 3; echo "ready ($name)";;
  stop) stop; echo stopped;;
  shot) get shot "file=$(enc "$3")";;
  js) get js "code=$(enc "$3")";;
  key) get key "key=$3&mods=$4";;
  open) get open "dir=$(enc "$3")";;
  api) get "$3" "$4";;
  *) sed -n 2,12p "$0";;
esac
