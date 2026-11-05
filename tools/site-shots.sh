#!/usr/bin/env bash
# Real app screenshots for the website, dark and light, into site/public/shots.
#   bash tools/site-shots.sh            capture PNGs, then make webp sizes (needs Python + Pillow)
#   bash tools/site-shots.sh --images   only remake the webp files from the last capture
# Uses the quiet dev copy (tools/dev.sh, NAME "site"). It opens Claude sessions on small
# demo folders under .devdata/site-demo and never sends a prompt to Claude: tile states
# are set by posting the same hook events Claude Code would send (they cost nothing).
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
NAME=site
dev() { bash "$root/tools/dev.sh" "$@"; }
out="$root/site/public/shots"; raw="$root/.devdata/$NAME/shots"
demo="$root/.devdata/site-demo"
if [ "${1:-}" != "--images" ]; then
dev stop "$NAME" >/dev/null 2>&1 || true
rm -rf "$root/.devdata/$NAME"   # a clean copy each run: no resumed tiles from last time
mkdir -p "$out" "$raw"

# Harmless demo folders with a file or two, so the tiles have real names.
for d in api-server web-app scraper notes; do
  mkdir -p "$demo/$d"
  [ -f "$demo/$d/README.md" ] || printf '# %s\n\nDemo folder for website screenshots.\n' "$d" > "$demo/$d/README.md"
done

dev start "$NAME"
json="$root/.devdata/$NAME/server.json"
port=$(sed 's/.*"port":\([0-9]*\).*/\1/' "$json"); token=$(sed 's/.*"token":"\([a-f0-9]*\)".*/\1/' "$json")
js() { dev js "$NAME" "$1"; }
hook() { curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "$2" "http://127.0.0.1:$port/hook/$token/$1" >/dev/null; }
winpath() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
shot() { dev shot "$NAME" "$(winpath "$raw/$1.png")" >/dev/null; echo "shot $1"; }
run() { js "window.HangarCommands.run('$1'); 'ok'" >/dev/null; sleep 1.2; }
esc() { dev key "$NAME" Escape '' >/dev/null; sleep .6; }

for d in api-server web-app scraper notes; do dev open "$NAME" "$(winpath "$demo/$d")" >/dev/null; sleep 1; done
echo "waiting for Claude Code to start in the tiles"; sleep 18

ids=$(dev api "$NAME" list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tiles.map(t=>t.id).join(" ")))')
set -- $ids
[ $# -ge 4 ] || { echo "expected 4 tiles, got: $ids"; dev stop "$NAME"; exit 1; }
A=$1; B=$2; C=$3; D=$4

# Modes (sent with the next message only, so nothing reaches Claude here).
js "window.hangar.setMode('$A','build'); window.hangar.setMode('$B','review'); window.hangar.setMode('$D','notes'); 'ok'" >/dev/null

state() {  # working | needs | done | idle
  case "$2" in
    working) hook "$1" '{"hook_event_name":"UserPromptSubmit","prompt":"<site-shot>"}';;
    needs)   hook "$1" '{"hook_event_name":"UserPromptSubmit","prompt":"<site-shot>"}'
             hook "$1" '{"hook_event_name":"Notification","notification_type":"permission_prompt","message":"Claude needs your permission"}';;
    done)    hook "$1" '{"hook_event_name":"UserPromptSubmit","prompt":"<site-shot>"}'
             hook "$1" '{"hook_event_name":"Stop"}';;
  esac
}
state "$A" working; state "$B" needs; state "$C" done

# Sample numbers for the meters (no reply has been sent, so Claude Code has none yet).
# Posted the way the statusline command posts them; made up, but drawn by the real UI.
now=$(date +%s)
meter() {  # tile ctx% cost
  curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "{\"context_window\":{\"used_percentage\":$2,\"context_window_size\":200000},\"cost\":{\"total_cost_usd\":$3},\"rate_limits\":{\"five_hour\":{\"used_percentage\":34,\"resets_at\":$((now+7200))},\"seven_day\":{\"used_percentage\":52,\"resets_at\":$((now+302400))}}}" "http://127.0.0.1:$port/status/$token/$1" >/dev/null
}
meter "$A" 41 1.84; meter "$B" 23 0.62; meter "$C" 67 2.95; meter "$D" 8 0.11
sleep 2

capture() {  # $1 = dark | light
  local t=$1
  js "document.activeElement && document.activeElement.blur(); 'ok'" >/dev/null
  state "$A" working; sleep 1   # a quiet tile can drop back to idle; show it working
  shot "wall-$t"
  run view.overview;  shot "overview-$t"; esc
  run app.palette
  # A query that matches commands only (recent-folder rows would show this PC's paths).
  for k in s e s s i o n; do dev key "$NAME" "$k" '' >/dev/null; sleep .15; done; sleep .6
  shot "palette-$t";  esc
  js "window.HangarCommands.setScope && window.HangarCommands.setScope('$A'); 'ok'" >/dev/null
  run mode.choose;    shot "modes-$t";    esc
  run app.usage; sleep 1.5
  # The 14-day chart reads this PC's real transcripts: swap its names and sums for sample ones.
  js "(function(){const P=[['api-server','3.1M','\$148'],['web-app','2.4M','\$97'],['scraper','1.2M','\$61'],['notes','0.4M','\$12'],['docs','0.2M','\$6']];
    const h=document.querySelector('.uh-read'); if(!h) return 'no chart'; h.parentElement.querySelectorAll('.ur').forEach((r,i)=>{const p=P[i]||P[4];r.querySelector('.un').textContent=p[0];r.querySelector('.un').title='';r.querySelector('.uo').textContent=p[1];r.querySelector('.uc').textContent='≈'+p[2];});
    h.textContent='14 days  7.3M tokens  ≈\$324'; return 'ok';})()" >/dev/null
  shot "usage-$t";    esc
}
js "window.hangar.setSettings({ theme: 'dark' }); 'ok'" >/dev/null; sleep 1.5
capture dark
js "window.hangar.setSettings({ theme: 'light' }); 'ok'" >/dev/null; sleep 1.5
capture light
js "window.hangar.setSettings({ theme: 'system' }); 'ok'" >/dev/null
dev stop "$NAME"
fi

# webp in three widths for srcset (the PNGs stay in .devdata).
python - "$raw" "$out" <<'PY'
import sys, pathlib
from PIL import Image
raw, out = map(pathlib.Path, sys.argv[1:3])
# Phone crops in 1400x900 window coordinates. Sizes must match the site's <source> width/height.
CROPS = {
    'overview': (0, 0, 760, 480),
    'palette': (400, 160, 1000, 520),
    'modes': (0, 44, 560, 584),
    'usage': (650, 34, 1050, 710),
}
for p in sorted(raw.glob('*.png')):
    im = Image.open(p).convert('RGB')
    for w in (640, 1100, 1400):   # fixed widths: the site's srcset names them
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(out / f'{p.stem}-{w}.webp', 'WEBP', quality=82, method=6)
    # A close crop for phones, where the whole window would be too small to read.
    name = p.stem.rsplit('-', 1)[0]
    box = CROPS.get(name)
    if box:
        sx = im.width / 1400
        c = im.crop(tuple(round(v * sx) for v in box))
        c = c.resize((box[2] - box[0], box[3] - box[1]), Image.LANCZOS)
        c.save(out / f'{p.stem}-crop.webp', 'WEBP', quality=84, method=6)
    print(p.stem, im.size)
PY
echo "done: $out"
