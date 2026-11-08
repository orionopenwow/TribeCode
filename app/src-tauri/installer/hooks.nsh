; TribeCode NSIS hooks (tauri.conf.json bundle.windows.nsis.installerHooks).
; Before v0.17.5 the in-app updater installed the per-machine .msi while the Download button gave the per-user
; setup .exe, so some PCs ended up with two TribeCodes side by side and the old one never went away.
; Releases now ship only this installer; on install it quietly removes any TribeCode that came from the .msi.
!macro NSIS_HOOK_PREINSTALL
  Push $0
  Push $1
  Push $2
  Push $3
  SetRegView 64
  StrCpy $0 0
  tc_msi_loop:
    EnumRegKey $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" tc_msi_done
    IntOp $0 $0 + 1
    ReadRegStr $2 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    StrCmp $2 "TribeCode" 0 tc_msi_loop
    ReadRegDWORD $3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\$1" "WindowsInstaller"
    StrCmp $3 "1" 0 tc_msi_loop
    DetailPrint "Removing the older TribeCode (installed from the .msi)"
    ExecWait 'msiexec.exe /x $1 /passive REBOOT=ReallySuppress'
    StrCpy $0 0   ; the list changed: look again from the top
    Goto tc_msi_loop
  tc_msi_done:
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
