!macro customInstall
  ; The desktop server listens on a random port, so allow the installed
  ; executable rather than opening a fixed port range.
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Glide Remote" dir=in action=allow protocol=TCP program="$INSTDIR\Glide Remote.exe" profile=private enable=yes'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Glide Remote"'
!macroend
