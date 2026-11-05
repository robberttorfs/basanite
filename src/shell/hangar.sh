# Loaded into Hangar terminal tiles (bash and zsh). Running `claude` here adds
# Hangar's hook settings, so the tile becomes a full Hangar session while
# Claude Code runs and turns back into a terminal when it exits.
__hangar_interactive() {
  for __h_a in "$@"; do case "$__h_a" in -p|--print|-v|--version|-h|--help) return 1;; esac; done
  case "$1" in mcp|config|doctor|update|upgrade|install|plugin|plugins|setup-token|migrate-installer|auth|agents) return 1;; esac
  return 0
}
unalias claude 2>/dev/null
claude() {
  if [ -n "$HANGAR_SETTINGS" ] && __hangar_interactive "$@"; then
    command claude --settings "$HANGAR_SETTINGS" "$@"
    __h_rc=$?
    curl -s -m 2 -X POST "$(cat "$HANGAR_DETACH_FILE" 2>/dev/null)" >/dev/null 2>&1
    return $__h_rc
  fi
  command claude "$@"
}
