; Extra NSIS steps for the Windows installer (electron-builder includes this file).
;
; An update started from inside the app (--updated) always runs silently: no
; "Choose Installation Options" page, no Next or Finish to press. Versions up to
; 0.4.3 started the installer in its visible mode, so the update sat on that page,
; behind other windows, with the app already closed. This also covers those.
!macro customInit
  ${if} ${isUpdated}
    SetSilent silent
  ${endIf}
!macroend
