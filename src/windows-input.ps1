[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RemoteInput {
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,int d,UIntPtr e);
 [DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
 // INPUT contains a union whose largest member is MOUSEINPUT, even for keyboard events.
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION data; }
 [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION {
  [FieldOffset(0)] public KEYBDINPUT ki;
  [FieldOffset(0)] public MOUSEINPUT mi;
 }
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint mouseData,dwFlags,time; public UIntPtr dwExtraInfo; }
 [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
 public static void TypeText(string text) {
  var list = new System.Collections.Generic.List<INPUT>();
  for(int i=0;i<text.Length;i++) {
   char c=text[i];
   if(c=='\r' || c=='\n') { if(c=='\r' && i+1<text.Length && text[i+1]=='\n') i++; list.Add(VirtualKey(0x0D,0)); list.Add(VirtualKey(0x0D,2)); }
   else { list.Add(UnicodeKey(c,4)); list.Add(UnicodeKey(c,6)); }
  }
  Submit(list.ToArray());
 }
 public static void PressKey(ushort key) { Submit(new INPUT[] { VirtualKey(key,0), VirtualKey(key,2) }); }
 static void Submit(INPUT[] inputs) {
  if(inputs.Length==0) return;
  uint sent=SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(INPUT)));
  if(sent!=inputs.Length) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Windows rejected keyboard input. Focus a normal, non-administrator text field.");
 }
 static INPUT UnicodeKey(ushort scan,uint flags) { return new INPUT { type=1, data=new INPUTUNION { ki=new KEYBDINPUT { wScan=scan,dwFlags=flags } } }; }
 static INPUT VirtualKey(ushort key,uint flags) { return new INPUT { type=1, data=new INPUTUNION { ki=new KEYBDINPUT { wVk=key,dwFlags=flags } } }; }
 public const uint MOVE=1,LD=2,LU=4,RD=8,RU=16,WHEEL=2048,KU=2;
}
"@
$keys=@{volumeup=0xAF;volumedown=0xAE;volumemute=0xAD;playpause=0xB3;next=0xB0;previous=0xB1}
while(($line=[Console]::In.ReadLine())-ne $null){try{$m=$line|ConvertFrom-Json
 if($m.type-eq'move'){[RemoteInput]::mouse_event(1,[int]$m.dx,[int]$m.dy,0,[UIntPtr]::Zero)}
 elseif($m.type-eq'click'){if($m.button-eq'right'){[RemoteInput]::mouse_event(8,0,0,0,[UIntPtr]::Zero);[RemoteInput]::mouse_event(16,0,0,0,[UIntPtr]::Zero)}else{[RemoteInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[RemoteInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}}
 elseif($m.type-eq'scroll'){[RemoteInput]::mouse_event(2048,0,0,[int](-120*$m.delta),[UIntPtr]::Zero)}
 elseif($m.type-eq'key'-and$m.key-eq'enter'){[RemoteInput]::PressKey(0x0D)}
 elseif($m.type-eq'key'-and$m.key-eq'backspace'){[RemoteInput]::PressKey(0x08)}
 elseif($m.type-eq'key'-and$keys.ContainsKey([string]$m.key)){$k=[byte]$keys[[string]$m.key];[RemoteInput]::keybd_event($k,0,0,[UIntPtr]::Zero);[RemoteInput]::keybd_event($k,0,2,[UIntPtr]::Zero)}
 elseif($m.type-eq'text'-and$m.text){[RemoteInput]::TypeText([string]$m.text)}
}catch{[Console]::Error.WriteLine('Input failed: ' + $_.Exception.Message)}}
