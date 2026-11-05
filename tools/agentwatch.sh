#!/usr/bin/env bash
# Watches background agents by the files they own. Exits (so the lead wakes up) when:
#   - any watched agent has not changed a file for $IDLE minutes (possibly stuck), or
#   - $MAX minutes have passed (a regular check-in).
# usage: bash tools/agentwatch.sh IDLE MAX "name=dir1,dir2" "name2=dir3" ...
IDLE=${1:-15}; MAX=${2:-40}; shift 2
root="E:/AI/Claude/hangar-open-source"
start=$(date +%s)
newest() { # newest mtime (epoch) of any file under the given comma-separated dirs
  local best=0 d t
  IFS=',' read -ra ds <<< "$1"
  for d in "${ds[@]}"; do
    [ -e "$root/$d" ] || continue
    t=$(find "$root/$d" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
    [ -n "$t" ] && [ "$t" -gt "$best" ] && best=$t
  done
  echo $best
}
while true; do
  now=$(date +%s)
  for spec in "$@"; do
    name=${spec%%=*}; dirs=${spec#*=}
    t=$(newest "$dirs")
    [ "$t" -lt "$start" ] && t=$start   # grace: an agent that has not written yet is measured from when the watch started
    idle=$(( (now - t) / 60 ))
    if [ "$t" -gt 0 ] && [ "$idle" -ge "$IDLE" ]; then echo "STUCK? $name: no file changes for $idle min"; exit 0; fi
  done
  if [ $(( (now - start) / 60 )) -ge "$MAX" ]; then
    for spec in "$@"; do name=${spec%%=*}; t=$(newest "${spec#*=}"); echo "$name: last change $(( (now - t) / 60 )) min ago"; done
    echo "CHECK-IN after $MAX min"; exit 0
  fi
  sleep 60
done
