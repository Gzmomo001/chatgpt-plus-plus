Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define ROOT "..\..\.."

Name "ChatGPT++"
OutFile "${ROOT}\dist\windows\ChatGPTPlusPlus-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\ChatGPT++"
InstallDirRegKey HKCU "Software\ChatGPTPlusPlus" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!define MUI_ICON "${ROOT}\apps\chatgpt-plus-manager\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\apps\chatgpt-plus-manager\src-tauri\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"

  nsExec::ExecToLog 'taskkill /IM chatgpt-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM chatgpt-plus-plus-manager.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codex-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM codex-plus-plus-manager.exe /F'
  Pop $0

  File "${ROOT}\dist\windows\app\chatgpt-plus-plus-manager.exe"

  Delete "$DESKTOP\ChatGPT++ 绠＄悊宸ュ叿.lnk"
  Delete "$SMPROGRAMS\ChatGPT++\ChatGPT++ 绠＄悊宸ュ叿.lnk"
  Delete "$DESKTOP\Codex++.lnk"
  Delete "$DESKTOP\Codex++ 管理工具.lnk"
  Delete "$SMPROGRAMS\Codex++\Codex++.lnk"
  Delete "$SMPROGRAMS\Codex++\Codex++ 管理工具.lnk"

  Delete "$DESKTOP\ChatGPT++ 管理工具.lnk"
  Delete "$SMPROGRAMS\ChatGPT++\ChatGPT++ 管理工具.lnk"
  Delete "$SMSTARTUP\ChatGPTPlusPlusWatcher.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ChatGPTPlusPlusWatcher"
  CreateShortcut "$DESKTOP\ChatGPT++.lnk" "$INSTDIR\chatgpt-plus-plus-manager.exe" "" "$INSTDIR\chatgpt-plus-plus-manager.exe"
  CreateDirectory "$SMPROGRAMS\ChatGPT++"
  CreateShortcut "$SMPROGRAMS\ChatGPT++\ChatGPT++.lnk" "$INSTDIR\chatgpt-plus-plus-manager.exe" "" "$INSTDIR\chatgpt-plus-plus-manager.exe"
  CreateShortcut "$SMPROGRAMS\ChatGPT++\卸载 ChatGPT++.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\chatgpt-plus-plus-manager.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\ChatGPTPlusPlus" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus" "DisplayName" "ChatGPT++"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus" "Publisher" "Gzmomo001"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus" "DisplayIcon" "$INSTDIR\chatgpt-plus-plus-manager.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus" "UninstallString" "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /IM chatgpt-plus-plus.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM chatgpt-plus-plus-manager.exe /F'
  Pop $0

  Delete "$DESKTOP\ChatGPT++.lnk"
  Delete "$DESKTOP\ChatGPT++ 管理工具.lnk"
  Delete "$DESKTOP\ChatGPT++ 绠＄悊宸ュ叿.lnk"
  Delete "$SMPROGRAMS\ChatGPT++\ChatGPT++.lnk"
  Delete "$SMPROGRAMS\ChatGPT++\ChatGPT++ 管理工具.lnk"
  Delete "$SMPROGRAMS\ChatGPT++\ChatGPT++ 绠＄悊宸ュ叿.lnk"
  Delete "$SMPROGRAMS\ChatGPT++\卸载 ChatGPT++.lnk"
  Delete "$SMSTARTUP\ChatGPTPlusPlusWatcher.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ChatGPTPlusPlusWatcher"
  RMDir "$SMPROGRAMS\ChatGPT++"

  Delete "$INSTDIR\chatgpt-plus-plus.exe"
  Delete "$INSTDIR\chatgpt-plus-plus-manager.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ChatGPTPlusPlus"
  DeleteRegKey HKCU "Software\ChatGPTPlusPlus"
SectionEnd
