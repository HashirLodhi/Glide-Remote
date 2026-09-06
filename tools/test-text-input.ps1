# Opens a disposable text box, sends messages through the real helper process,
# verifies actual Windows-delivered characters, then closes the test window.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TestFocus {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$helperPath = Join-Path $PSScriptRoot '..\src\windows-input.ps1'
$info = New-Object System.Diagnostics.ProcessStartInfo
$info.FileName = 'powershell.exe'
$info.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $helperPath + '"'
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardInput = $true
$info.RedirectStandardError = $true
$helper = [System.Diagnostics.Process]::Start($info)
$writer = New-Object System.IO.StreamWriter($helper.StandardInput.BaseStream, (New-Object System.Text.UTF8Encoding($false)))
$writer.AutoFlush = $true
$errorRead = $helper.StandardError.ReadToEndAsync()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Glide keyboard verification - closes automatically'
$form.Width = 640; $form.Height = 230
$form.TopMost = $true
$field = New-Object System.Windows.Forms.TextBox
$field.Multiline = $true; $field.Dock = 'Fill'
$form.Controls.Add($field)
$script:phase = 0
$script:failure = $null
$unicode = 'Glide {} + ^ % ~ ' + [char]0x00E9 + ' ' + [char]0x0627
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
 try {
  if([TestFocus]::GetForegroundWindow() -ne $form.Handle) { throw 'Test aborted: verification window lost focus.' }
  switch ($script:phase) {
   0 { $writer.WriteLine((@{type='text';text=$unicode} | ConvertTo-Json -Compress)) }
   1 { if($field.Text -cne $unicode){throw 'Unicode text did not arrive intact.'}; $writer.WriteLine('{"type":"key","key":"enter"}'); $writer.WriteLine('{"type":"text","text":"abc"}') }
   2 { if($field.Text -cne ($unicode+"`r`nabc")){throw 'Enter or streaming text failed.'}; $writer.WriteLine('{"type":"key","key":"backspace"}') }
   3 { if($field.Text -cne ($unicode+"`r`nab")){throw 'Backspace failed.'}; $writer.WriteLine('{"type":"text","text":"\nnext"}') }
   4 { if($field.Text -cne ($unicode+"`r`nab`r`nnext")){throw 'Newline text failed.'}; $timer.Stop(); $form.Close() }
  }
  $script:phase++
 } catch { $script:failure=$_.Exception.Message; $timer.Stop(); $form.Close() }
})
$form.Add_Shown({$form.Activate();$field.Focus() | Out-Null;$timer.Start()})
try { [System.Windows.Forms.Application]::Run($form) }
finally { $timer.Dispose();$form.Dispose();$writer.Close();if(-not $helper.WaitForExit(5000)){$helper.Kill()} }
$helperErrors = $errorRead.GetAwaiter().GetResult()
if($script:failure){throw $script:failure}
if($script:phase -lt 5){throw 'Test window closed before verification completed.'}
if($helperErrors){throw $helperErrors}
Write-Output 'PASS: actual Windows text box received Unicode, special characters, incremental text, Enter, Backspace, and newline.'
