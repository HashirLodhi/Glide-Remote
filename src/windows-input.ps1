Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RemoteInput {
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,int x,int y,int d,UIntPtr e);
 [DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 public const uint MOVE=1,LD=2,LU=4,RD=8,RU=16,WHEEL=2048,KU=2;
}
"@
$keys=@{volumeup=0xAF;volumedown=0xAE;volumemute=0xAD;playpause=0xB3;next=0xB0;previous=0xB1}
while(($line=[Console]::In.ReadLine())-ne $null){try{$m=$line|ConvertFrom-Json
 if($m.type-eq'move'){[RemoteInput]::mouse_event(1,[int]$m.dx,[int]$m.dy,0,[UIntPtr]::Zero)}
 elseif($m.type-eq'click'){if($m.button-eq'right'){[RemoteInput]::mouse_event(8,0,0,0,[UIntPtr]::Zero);[RemoteInput]::mouse_event(16,0,0,0,[UIntPtr]::Zero)}else{[RemoteInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[RemoteInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)}}
 elseif($m.type-eq'scroll'){[RemoteInput]::mouse_event(2048,0,0,[int](-120*$m.delta),[UIntPtr]::Zero)}
 elseif($m.type-eq'key'-and$keys.ContainsKey([string]$m.key)){$k=[byte]$keys[[string]$m.key];[RemoteInput]::keybd_event($k,0,0,[UIntPtr]::Zero);[RemoteInput]::keybd_event($k,0,2,[UIntPtr]::Zero)}
}catch{}}
