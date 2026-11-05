# Hangar: read the user's own .zshrc, then come back here for the next file.
HANGAR_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="${HANGAR_USER_ZDOTDIR:-$HOME}"
[ -f "$ZDOTDIR/.zshrc" ] && . "$ZDOTDIR/.zshrc"
HANGAR_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$HANGAR_ZDOTDIR"
. "$HANGAR_SHELL_DIR/hangar.sh"
