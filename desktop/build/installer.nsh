; Rabbithole's additions to electron-builder's assisted NSIS installer (ADR 0025): one per-user install folder,
; named Rabbithole, holding the app and its data folder. electron-builder includes this file before its templates.

; Always for the current user, so the installer never shows the "Anyone who uses this computer" page or asks for admin.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!ifndef BUILD_UNINSTALLER
  ; The folder page, skipped on update. The pre function of the next page (the install itself) then puts the app
  ; in a Rabbithole folder inside the chosen one, unless the chosen one is already named Rabbithole.
  !macro customPageAfterChangeDir
    !insertmacro skipPageIfUpdated
    !insertmacro MUI_PAGE_DIRECTORY

    Function rabbitholeFolder
      ${ifNot} ${isUpdated}
        StrCpy $0 $INSTDIR "" -11
        ${if} $0 != "\Rabbithole"
          StrCpy $INSTDIR "$INSTDIR\Rabbithole"
        ${endIf}
      ${endIf}
    FunctionEnd

    !define MUI_PAGE_CUSTOMFUNCTION_PRE rabbitholeFolder
  !macroend
!else
  ; "1" when the learner unticks the box. A silent uninstall shows no page, so it deletes the data folder too.
  Var rabbitholeKeepData
  Var rabbitholeDeleteBox

  !macro customUnWelcomePage
    !insertmacro MUI_UNPAGE_WELCOME
    UninstPage custom un.rabbitholeDataPage un.rabbitholeDataLeave

    Function un.rabbitholeDataPage
      !insertmacro MUI_HEADER_TEXT "Uninstall Rabbithole" "Choose whether your data goes too."
      nsDialogs::Create 1018
      Pop $0
      ${NSD_CreateCheckbox} 0u 0u 100% 12u "Also delete my learning trees, videos and add-ons"
      Pop $rabbitholeDeleteBox
      ${if} $rabbitholeKeepData != "1"
        ${NSD_Check} $rabbitholeDeleteBox
      ${endIf}
      nsDialogs::Show
    FunctionEnd

    Function un.rabbitholeDataLeave
      ${NSD_GetState} $rabbitholeDeleteBox $0
      ${if} $0 == ${BST_CHECKED}
        StrCpy $rabbitholeKeepData "0"
      ${else}
        StrCpy $rabbitholeKeepData "1"
      ${endIf}
    FunctionEnd
  !macroend

  ; Replaces the default removal of the whole folder. The uninstall an update or reinstall runs passes --updated
  ; and always keeps the data folder; otherwise it goes unless the learner unticked the box.
  ; Unlike the default update path, this deletes in place rather than renaming every file into %TEMP% first,
  ; which would move gigabytes of data and fails when the install folder is on another drive.
  !macro customRemoveFiles
    SetOutPath $TEMP
    ${if} ${isUpdated}
    ${orIf} $rabbitholeKeepData == "1"
      FindFirst $R1 $R2 "$INSTDIR\*.*"
      ${doWhile} $R2 != ""
        ${if} $R2 != "."
        ${andIf} $R2 != ".."
        ${andIf} $R2 != "data"
          ; Each runs on whichever kind of entry it is and does nothing for the other.
          RMDir /r "$INSTDIR\$R2"
          Delete "$INSTDIR\$R2"
        ${endIf}
        FindNext $R1 $R2
      ${loop}
      FindClose $R1
    ${else}
      RMDir /r $INSTDIR
    ${endIf}
  !macroend
!endif
