Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RemoteInput {
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,int d,UIntPtr e);
 [DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public KEYBDINPUT ki; }
 [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
 public static void TypeText(string text) { var list = new System.Collections.Generic.List<INPUT>(); foreach(char c in text) { if(c=='\r') continue; if(c=='\n') { list.Add(Key(0x0D,0)); list.Add(Key(0x0D,2)); } else { list.Add(Key(c,4)); list.Add(Key(c,6)); } } if(list.Count>0) SendInput((uint)list.Count,list.ToArray(),Marshal.SizeOf(typeof(INPUT))); }
 static INPUT Key(ushort scan,uint flags) { return new INPUT { type=1, ki=new KEYBDINPUT { wVk=0, wScan=scan, dwFlags=flags, time=0, dwExtraInfo=UIntPtr.Zero } }; }
 public const uint MOVE=1,LD=2,LU=4,RD=8,RU=16,WHEEL=2048,KU=2;
}
"@
Add-Type -AssemblyName System.Windows.Forms
$keys=@{volumeup=0xAF;volumedown=0xAE;volumemute=0xAD;playpause=0xB3;next=0xB0;previous=0xB1}
while(($line=[Console]::In.ReadLine())-ne $null){try{$m=$line|ConvertFrom-Json
 if($m.type-eq'move'){[RemoteInput]::mouse_event(1,[int]$m.dx,[int]$m.dy,0,[UIntPtr]::Zero)}
 elseif($m.type-eq'click'){if($m.button-eq'right'){[RemoteInput]::mouse_event(8,0,0,0,[UIntPtr]::Zero);[RemoteInput]::mouse_event(16,0,0,0,[UIntPtr]::Zero)}else{[RemoteInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[RemoteInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}}
 elseif($m.type-eq'scroll'){[RemoteInput]::mouse_event(2048,0,0,[int](-120*$m.delta),[UIntPtr]::Zero)}
 elseif($m.type-eq'key'-and$m.key-eq'enter'){[RemoteInput]::keybd_event(0x0D,0,0,[UIntPtr]::Zero);[RemoteInput]::keybd_event(0x0D,0,2,[UIntPtr]::Zero)}
 elseif($m.type-eq'key'-and$keys.ContainsKey([string]$m.key)){$k=[byte]$keys[[string]$m.key];[RemoteInput]::keybd_event($k,0,0,[UIntPtr]::Zero);[RemoteInput]::keybd_event($k,0,2,[UIntPtr]::Zero)}
 elseif($m.type-eq'text'-and$m.text){[RemoteInput]::TypeText([string]$m.text)}
}catch{}}
