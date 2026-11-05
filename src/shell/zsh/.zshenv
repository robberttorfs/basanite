# Hangar: read the user's own .zshenv, then come back here for the next file.
HANGAR_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="${HANGAR_USER_ZDOTDIR:-$HOME}"
[ -f "$ZDOTDIR/.zshenv" ] && . "$ZDOTDIR/.zshenv"
HANGAR_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$HANGAR_ZDOTDIR"
