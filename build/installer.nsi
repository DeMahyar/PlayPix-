; PlayPix — Windows installer (NSIS)
; Compiled with the native Linux makensis bundled by electron-builder (no Wine needed).
Unicode true
!addincludedir "/home/z/.cache/electron-builder/nsis/nsis-3.0.4.1/Include"
!addplugindir "/home/z/.cache/electron-builder/nsis/nsis-resources-3.4.1/plugins/x86-unicode"
!addplugindir "/home/z/.cache/electron-builder/nsis/nsis-3.0.4.1/Plugins/x86-unicode"
!include "MUI2.nsh"

!define APPNAME "PlayPix"
!define VERSION "1.2.0"
!define EXENAME "PlayPix.exe"
!define UNINSTNAME "Uninstall PlayPix.exe"

!define MUI_ICON "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXENAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch PlayPix"

Name "${APPNAME} ${VERSION}"
OutFile "..\release\PlayPix-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\release\win-unpacked\*.*"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\${UNINSTNAME}"

  ; Shortcuts
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\Uninstall ${APPNAME}.lnk" "$INSTDIR\${UNINSTNAME}"
  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"

  ; Add/Remove Programs entry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "Publisher" "PlayPix"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" '"$INSTDIR\${UNINSTNAME}"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "QuietUninstallString" '"$INSTDIR\${UNINSTNAME}" /S'
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" $INSTDIR

  WriteUninstaller "$INSTDIR\${UNINSTNAME}"
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKCU "Software\${APPNAME}"
SectionEnd
