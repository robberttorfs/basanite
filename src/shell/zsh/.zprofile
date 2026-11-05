# Hangar: read the user's own .zprofile, then come back here for the next file.
HANGAR_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="${HANGAR_USER_ZDOTDIR:-$HOME}"
[ -f "$ZDOTDIR/.zprofile" ] && . "$ZDOTDIR/.zprofile"
HANGAR_USER_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="$HANGAR_ZDOTDIR"
