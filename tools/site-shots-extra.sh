#!/usr/bin/env bash
# Two more real shots for the site: workspace pills and the changes peek. No prompts are sent.
set -e
root="$(cd "$(dirname "$0")/.." && pwd)"
NAME=site3
dev() { bash "$root/tools/dev.sh" "$@"; }
raw="$root/.devdata/$NAME-shots"; mkdir -p "$raw"
demo="${SITE_DEMO:-/e/demo}"
dev stop "$NAME" >/dev/null 2>&1 || true
rm -rf "$root/.devdata/$NAME"
# a small uncommitted change for the peek
(cd "$demo/web-app" && git checkout -q . 2>/dev/null; rm -f src-date.js; printf "const http = require('http');\nconst { format } = require('date-fns');\n\nhttp.createServer((req, res) => {\n  res.end(format(new Date(), 'yyyy-MM-dd'));\n}).listen(process.env.PORT || 3000);\n" > server.js; printf "export const today = () => new Date();\n" > src-date.js)
DEV_CLAUDE_ARGS="--model haiku --permission-mode default" DEV_ELECTRON_ARGS=--force-device-scale-factor=2 dev start "$NAME"
winpath() { cygpath -w "$1"; }
js() { dev js "$NAME" "$1"; }
json="$root/.devdata/$NAME/server.json"
port=$(sed 's/.*"port":\([0-9]*\).*/\1/' "$json"); token=$(sed 's/.*"token":"\([a-f0-9]*\)".*/\1/' "$json")
send() { curl -s -m 10 -X POST -H 'Content-Type: application/json' -d "{\"tile\":\"$1\",\"text\":\"$2\"}" "http://127.0.0.1:$port/api/$token/send" >/dev/null; }
screenof() { dev api "$NAME" screen "tile=$1&lines=40"; }
statusof() { dev api "$NAME" list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).tiles.find(t=>t.id===process.argv[1]);console.log(t?t.status:"")})' "$1"; }
js "window.hangar.setSettings({ theme: 'dark' }); 'ok'" >/dev/null; sleep 1
js "(async()=>{ await hangar.wsCreate('School'); await hangar.wsCreate('Side project'); await hangar.wsCreate('Client'); return 'ok'; })()" >/dev/null; sleep 2
for d in api-server web-app scraper notes; do dev open "$NAME" "$(winpath "$demo/$d")" >/dev/null; sleep 1; done
sleep 16
ids=$(dev api "$NAME" list | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).tiles.map(t=>t.id).join(" ")))')
set -- $ids
A=$1; B=$2; C=$3; D=$4
for t in "$A" "$B" "$C" "$D"; do
  for i in $(seq 1 15); do screenof "$t" | grep -q "trust this folder\|Try \"" && break; sleep 2; done
  for i in 1 2 3; do screenof "$t" | grep -q "trust this folder" || break; send "$t" "\u001b[B"; sleep 4; done
done
sleep 10
send "$A" "what routes are in routes.js? one line"
send "$C" "say hi in three words"
send "$B" "run npm test"
for i in $(seq 1 45); do [ "$(statusof "$B")" = needs_input ] && [ "$(statusof "$A")" != working ] && [ "$(statusof "$C")" != working ] && break; sleep 2; done
sleep 2
js "document.activeElement && document.activeElement.blur(); 'ok'" >/dev/null
dev shot "$NAME" "$(winpath "$raw/ws.png")" >/dev/null
js "(()=>{const e=document.querySelector('.gitchip.dirty'); if(e) e.click(); return e?e.outerHTML.slice(0,120):'none';})()"; echo; sleep 2.5
js "(()=>{const f=[...document.querySelectorAll('.changes-pop .cf')]; if(f[0]) f[0].click(); return f.length;})()"; echo; sleep 1.2
dev shot "$NAME" "$(winpath "$raw/changes.png")" >/dev/null
js "(()=>{const b=document.querySelector('.changes-pop'); if(!b) return 'nopop'; const r=b.getBoundingClientRect(); return [r.left,r.top,r.width,r.height].join(' ');})()"; echo
dev stop "$NAME" >/dev/null 2>&1 || true
(cd "$demo/web-app" && git checkout -q . ; rm -f src-date.js)
echo done "$raw"
