# Hangar: read the user's own .zlogin, then come back here for the next file.
HANGAR_ZDOTDIR="$ZDOTDIR"
ZDOTDIR="${HANGAR_USER_ZDOTDIR:-$HOME}"
[ -f "$ZDOTDIR/.zlogin" ] && . "$ZDOTDIR/.zlogin"
HANGAR_USER_ZDOTDIR="$ZDOTDIR"
# Last file of a login shell: hand ZDOTDIR back to the user.
ZDOTDIR="$HANGAR_USER_ZDOTDIR"
unset HANGAR_ZDOTDIR
