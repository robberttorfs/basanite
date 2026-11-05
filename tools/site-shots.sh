#!/usr/bin/env bash
# Real app screenshots for the website, dark and light, into site/public/shots.
#   bash tools/site-shots.sh            capture PNGs, then make webp sizes (needs Python + Pillow)
#   bash tools/site-shots.sh --images   only remake the webp files from the last capture
# Captures at 2x (DEV_ELECTRON_ARGS=--force-device-scale-factor=2). Each feature gets a tight
# crop of its own part of the window (box measured in the renderer), saved as <name>-<theme>.webp
# (2x) and <name>-<theme>-1x.webp; the site shows them at their 1x CSS size. The wall stays whole.
# Sample data only: preview text, the permission menu and usage names are swapped in by JS.
# Uses the quiet dev copy (tools/dev.sh, NAME "site"). It opens Claude sessions on small
# demo folders under .devdata/site-demo and never sends a prompt to Claude: tile states
# are set by posting the same hook events Claude Code would send (they cost nothing).
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
NAME=site
dev() { bash "$root/tools/dev.sh" "$@"; }
out="$root/site/public/shots"; raw="$root/.devdata/$NAME/shots"
# Neutral demo folders (their path shows in each tile's Claude Code banner). Removed at the end.
demo="${SITE_DEMO:-/e/demo}"
if [ "${1:-}" != "--images" ]; then
dev stop "$NAME" >/dev/null 2>&1 || true
rm -rf "$root/.devdata/$NAME"   # a clean copy each run: no resumed tiles from last time
mkdir -p "$out" "$raw"

# Tiny demo repos, so the tiles have real names and a little real work to show.
for d in api-server web-app scraper notes; do
  mkdir -p "$demo/$d"
  [ -f "$demo/$d/README.md" ] || printf '# %s\n' "$d" > "$demo/$d/README.md"
done
[ -f "$demo/web-app/server.js" ] || printf "const http = require('http');\n\nhttp.createServer((req, res) => {\n  res.end('ok');\n}).listen(3000);\n" > "$demo/web-app/server.js"
[ -f "$demo/api-server/routes.js" ] || printf "module.exports = { users: '/users', posts: '/posts' };\n" > "$demo/api-server/routes.js"
for d in api-server web-app scraper notes; do (cd "$demo/$d" && [ -d .git ] || { git init -q && git add -A && git -c user.name=demo -c user.email=demo@example.com commit -qm init; }); done

# Default permission mode, so an edit asks first (the owner's own settings may auto-accept).
DEV_CLAUDE_ARGS="--model haiku --permission-mode default" DEV_ELECTRON_ARGS=--force-device-scale-factor=2 dev start "$NAME"
json="$root/.devdata/$NAME/server.json"
port=$(sed 's/.*"port":\([0-9]*\).*/\1/' "$json"); token=$(sed 's/.*"token":"\([a-f0-9]*\)".*/\1/' "$json")
js() { dev js "$NAME" "$1"; }
hook() { curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "$2" "http://127.0.0.1:$port/hook/$token/$1" >/dev/null; }
winpath() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else echo "$1"; fi; }
shot() { dev shot "$NAME" "$(winpath "$raw/$1.png")" >/dev/null; echo "shot $1"; }
run() { js "window.HangarCommands.run('$1'); 'ok'" >/dev/null; sleep 1.2; }
esc() { dev key "$NAME" Escape '' >/dev/null; sleep .6; }
# box NAME 'JS returning [x,y,w,h] in CSS px': saves the crop box (device px) next to the shot.
box() { js "(function(){const b=$2;const d=devicePixelRatio;return b.map(v=>Math.round(v*d)).join(' ');})()" | sed 's/.*"text":"\([^"]*\)".*/\1/' > "$raw/$1.box"; }
R='((s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})'
# Union of the elements plus padding, clamped to the window, as [x,y,w,h].
U="((list,p)=>{const rs=list.map(s=>$R(s)).filter(Boolean);const a=Math.max(0,Math.min(...rs.map(r=>r[0]))-p),b=Math.max(0,Math.min(...rs.map(r=>r[1]))-p),c=Math.min(innerWidth,Math.max(...rs.map(r=>r[2]))+p),d=Math.min(innerHeight,Math.max(...rs.map(r=>r[3]))+p);return [a,b,c-a,d-b]})"

for d in api-server web-app scraper notes; do dev open "$NAME" "$(winpath "$demo/$d")" >/dev/null; sleep 1; done
echo "waiting for Claude Code to start in the tiles"; sleep 18

ids=$(dev api "$NAME" list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tiles.map(t=>t.id).join(" ")))')
set -- $ids
[ $# -ge 4 ] || { echo "expected 4 tiles, got: $ids"; dev stop "$NAME"; exit 1; }
A=$1; B=$2; C=$3; D=$4

# Modes (sent with the next message). web-app stays in Build so its edit asks for permission.
js "window.hangar.setMode('$A','review'); window.hangar.setMode('$B','build'); window.hangar.setMode('$D','notes'); 'ok'" >/dev/null

# Three short real prompts (Haiku): two answers, and one command that waits on a permission menu.
statusof() { dev api "$NAME" list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).tiles.find(t=>t.id===process.argv[1]);console.log(t?t.status:"")})' "$1"; }
send() { curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "{\"tile\":\"$1\",\"text\":\"$2\"}" "http://127.0.0.1:$port/api/$token/send" >/dev/null; }
# New folders open on Claude Code's folder-trust question; option 2 is "Yes, I trust this folder".
screenof() { dev api "$NAME" screen "tile=$1&lines=40"; }
for t in "$A" "$B" "$C" "$D"; do
  for i in $(seq 1 15); do screenof "$t" | grep -q "trust this folder\|Try \"" && break; sleep 2; done
  # Arrow down to "Yes, I trust this folder", then Enter (send adds the Enter).
  for i in 1 2 3; do screenof "$t" | grep -q "trust this folder" || break; send "$t" "\u001b[B"; sleep 4; done
done
sleep 12
send "$A" "what routes are in routes.js? one line"
send "$C" "say hi in three words"
send "$B" "run npm test"
for i in $(seq 1 60); do
  [ "$(statusof "$B")" = needs_input ] && [ "$(statusof "$A")" != working ] && [ "$(statusof "$C")" != working ] && break
  sleep 2
done
echo "states: A=$(statusof "$A") B=$(statusof "$B") C=$(statusof "$C") D=$(statusof "$D")"

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
  shot "wall-$t"
  run view.overview
  # Lay the overview out at a smaller size so the crop stays readable on the page.
  js "(function(){const o=document.getElementById('overview'); o.style.width='940px'; o.style.height='500px'; return 'ok';})()" >/dev/null; sleep .5
  # No prompt was ever sent, so the preview has no messages and no menu. Draw sample ones
  # with the overview's own markup (the menu reads like Claude Code's edit prompt).
  # The overview redraws itself every second, so an observer puts the sample back each time.
  js "(function(){const p=document.querySelector('.ovw-preview'); if(!p) return 'no preview';
    const head=p.querySelector('.ovw-ph').outerHTML;
    const html=head+'<div class=\"ovw-feed\"><div class=\"msg you\"><div class=\"bubble\">move the date picker to the new API</div></div>'+
      '<div class=\"msg claude\"><p>The new picker needs <code>date-fns</code> 4, so I\u2019ll bump it in <code>package.json</code> first, then update <code>DatePicker.tsx</code> and run its tests.</p></div></div>'+
      '<pre class=\"ovw-menu\">Edit file package.json\n\n  \"date-fns\": \"^3.6.0\"  \u2192  \"^4.1.0\"\n\nDo you want to make this edit to package.json?\n\u276f 1. Yes\n  2. Yes, allow all edits during this session (shift+tab)\n  3. No, and tell Claude what to do differently (esc)</pre>'+
      '<div class=\"ovw-acts\"><button class=\"btn small\">1</button><button class=\"btn small\">2</button><button class=\"btn small\">3</button><div class=\"grow\"></div><button class=\"btn small primary\">Open<kbd>\u21a9</kbd></button></div>';
    const put=()=>{ if(p.innerHTML!==html){ p.innerHTML=html; } }; put();
    new MutationObserver(put).observe(p,{childList:true,subtree:true,characterData:true}); return 'ok';})()" >/dev/null
  sleep .4
  box "overview-$t" "$U(['#overview'],0)"
  shot "overview-$t"; esc
  js "(function(){const o=document.getElementById('overview'); o.style.width=''; o.style.height=''; return 'ok';})()" >/dev/null
  run app.palette
  # A query that matches commands only (recent-folder rows would show this PC's paths).
  for k in s e s s i o n; do dev key "$NAME" "$k" '' >/dev/null; sleep .15; done; sleep .6
  box "palette-$t" "$U(['.pop.palette'],28)"
  shot "palette-$t";  esc
  js "window.HangarCommands.setScope && window.HangarCommands.setScope('$A'); 'ok'" >/dev/null
  run mode.choose
  box "modes-$t" "(()=>{const b=$U(['.pop.modes-menu'],20);return [b[0],b[1]+14,b[2],b[3]-14]})()"
  shot "modes-$t";    esc
  run app.usage; sleep 1.5
  # The 14-day chart reads this PC's real transcripts: swap its names and sums for sample ones.
  js "(function(){const P=[['api-server','3.1M','\$148'],['web-app','2.4M','\$97'],['scraper','1.2M','\$61'],['notes','0.4M','\$12'],['docs','0.2M','\$6']];
    const h=document.querySelector('.uh-read'); if(!h) return 'no chart'; h.parentElement.querySelectorAll('.ur').forEach((r,i)=>{const p=P[i]||P[4];r.querySelector('.un').textContent=p[0];r.querySelector('.un').title='';r.querySelector('.uo').textContent=p[1];r.querySelector('.uc').textContent='≈'+p[2];});
    h.textContent='14 days  7.3M tokens  ≈\$324'; return 'ok';})()" >/dev/null
  box "usage-$t" "(()=>{const b=$U(['.pop.usage-pop'],20);return [b[0],0,b[2],b[1]+b[3]]})()"
  shot "usage-$t";    esc
}
js "window.hangar.setSettings({ theme: 'dark' }); 'ok'" >/dev/null; sleep 1.5
capture dark
js "window.hangar.setSettings({ theme: 'light' }); 'ok'" >/dev/null; sleep 1.5
capture light
js "window.hangar.setSettings({ theme: 'system' }); 'ok'" >/dev/null
dev stop "$NAME"
fi

# The wall: whole window in three widths (README and og:image). Features: their crop box,
# at 2x and 1x. The site's <img> width/height are the 1x sizes printed here.
python - "$raw" "$out" <<'PY'
import sys, pathlib
from PIL import Image
raw, out = map(pathlib.Path, sys.argv[1:3])
PHONE = {'overview': (395, 40, 940, 500), 'palette': (28, 28, 588, 289)}
for p in sorted(raw.glob('*.png')):
    im = Image.open(p).convert('RGB')
    b = p.with_suffix('.box')
    if not b.exists():
        for w in (640, 1100, 1400):
            h = round(im.height * w / im.width)
            im.resize((w, h), Image.LANCZOS).save(out / f'{p.stem}-{w}.webp', 'WEBP', quality=82, method=6)
        print(p.stem, im.size); continue
    x, y, w, h = map(int, b.read_text().split())
    c = im.crop((x, y, x + w, y + h))
    c.save(out / f'{p.stem}.webp', 'WEBP', quality=86, method=6)
    c.resize((w // 2, h // 2), Image.LANCZOS).save(out / f'{p.stem}-1x.webp', 'WEBP', quality=84, method=6)
    # Phones get a closer crop (CSS px inside the crop above): the preview pane, the palette box.
    ph = PHONE.get(p.stem.rsplit('-', 1)[0])
    if ph:
        c.crop(tuple(v * 2 for v in ph)).save(out / f'{p.stem}-phone.webp', 'WEBP', quality=86, method=6)
        print(p.stem, 'phone css', ph[2] - ph[0], 'x', ph[3] - ph[1])
    print(p.stem, 'css', w // 2, 'x', h // 2)
PY
echo "done: $out"
