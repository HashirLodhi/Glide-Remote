# Glide Remote

Use an Android phone as a Windows touchpad and media remote over your local Wi-Fi. The desktop app generates a pairing QR code; the phone sends mouse, scroll, and media commands directly to the PC. No cloud account or hosted backend is required.

## Install and connect

**Install the EXE on your desktop PC and the APK on your Android phone.**

| Device | Download | Requirements |
| --- | --- | --- |
| Windows desktop/laptop | [Glide Remote.exe](https://github.com/HashirLodhi/Glide-Remote/raw/refs/heads/main/setup/Glide%20Remote.exe) | Windows 10/11, 64-bit x64 |
| Android phone | [Glide Remote.apk](https://github.com/HashirLodhi/Glide-Remote/raw/refs/heads/main/setup/Glide%20Remote.apk) | Android 8.0 / API 26 or newer |

The two installation files live in [`setup/`](setup/). No Node.js, Java, or Android Studio is needed to use these prebuilt apps. This EXE is not for macOS or Linux; the APK is not for iPhone.

1. Download and run **Glide Remote.exe** on the PC, then complete the installer.
2. Transfer/download **Glide Remote.apk** to the phone and open it. If Android requests it, allow installation from the app opening the APK.
3. Connect both devices to the same trusted Wi-Fi. Avoid guest networks that isolate devices.
4. Open Glide Remote on the PC. Allow the installed app through Windows Firewall on **Private networks**. Set a trusted home network to Private if necessary.
5. Open Glide Remote on the phone, tap **SCAN PC CODE**, grant camera permission, and scan the QR code displayed on the PC.
6. Keep the desktop app open while using the remote.

These builds are not publisher-signed: Windows may display an unrecognized-app warning, and the APK uses a debug signing key for sideloading. Install only copies you trust. They are not Microsoft Store or Google Play releases.

### Controls

- One-finger drag: move the cursor.
- One-finger tap or **LEFT CLICK**: left click.
- Two-finger tap or **RIGHT CLICK**: right click.
- Two-finger drag: scroll.
- Media row: previous, play/pause, next, volume down, mute, and volume up.
- Text field: first click the target text field on the PC, then type on the phone. Characters appear immediately; deletions send Backspace.
- **CLEAR** resets the phone's typing field without deleting text on the PC.
- **ENTER**: press Enter in the active PC application.

The Android app is touch-only; gyro/air-mouse mode has been removed.

## How it works

```text
Android app (Kotlin)                 Windows app (Electron)
Camera -> QR pairing URL ----------> HTTP/WebSocket server
Touch gestures -> JSON over WS ----> Token authentication
                                    -> Protocol validation + limits
                                    -> PowerShell helper over stdin
                                    -> user32.dll mouse/keyboard events
                                    -> Windows cursor / active application
```

### Desktop implementation

`src/main.js` starts a Node.js HTTP server on `0.0.0.0` with an OS-assigned port. It selects a non-loopback IPv4 address, preferring a private address, and generates a QR image containing `http://<address>:<port>/?token=<random-token>` using `qrcode`.

Electron renders the pairing screen. Its renderer has context isolation and sandboxing enabled, Node integration disabled, and a preload bridge for session IPC. Navigation and new windows are blocked. The HTTP server also serves the optional browser remote under `src/mobile/`; that client is separate from the Android APK and does not have identical gesture/UI behavior.

The `ws` server validates the token before upgrading the connection. Valid messages are normalized by `src/protocol.js`. Mouse movement is coalesced over an 8 ms window before being written as newline-delimited JSON to the input helper's standard input.

`src/windows-input.ps1` uses PowerShell `Add-Type` to define P/Invoke bindings for `user32.dll`. It translates messages into `mouse_event` and `keybd_event` calls. Scroll deltas are converted to Windows wheel units using `-120 * delta`. The helper is shipped as an external Electron resource because PowerShell cannot execute a script directly inside `app.asar`.

### Android implementation

The native Android app uses Kotlin, AppCompat, and programmatically constructed views. ZXing Embedded provides QR decoding inside a custom scanner activity with close and flashlight controls. OkHttp carries the WebSocket connection.

The touchpad tracks pointer IDs. One-finger movement is scaled for display density and applies a small acceleration curve. Two-finger scrolling averages the tracked fingers' displacement and converts it into fractional wheel deltas. Both movement and scrolling are batched with `Choreographer` callbacks, limiting sends to display frames. Pointer changes reset the tracked positions so lifting one finger does not jump the cursor. Gesture travel is compared with Android's touch-slop threshold to distinguish taps from drags.

System-bar and display-cutout insets protect the header and scanner controls. The layout uses a fill-viewport scroll container with a minimum touchpad height; the pad prevents its parent from intercepting control gestures. Buttons provide ripple feedback, with haptic feedback for touchpad taps.

### Pairing and connection lifecycle

- Pairing tokens contain 32 random bytes encoded as base64url.
- Pairing codes expire after **10 minutes** and can be consumed only once.
- Successful pairing invalidates the original token and returns a separate resume token.
- Sessions expire after **8 hours**; closing the desktop app invalidates the session.
- The server keeps one active controller socket per session.
- WebSocket ping/pong checks run every 30 seconds to remove stale connections.
- The browser client stores the resume token in session storage and retries with exponential backoff. The current Android client does **not** implement resume-token reconnection; generate a fresh PC code and scan again after disconnecting.

### Wire protocol

Messages are JSON objects sent through WebSocket. The examples below illustrate payloads, not public endpoints.

| Type | Example | Server handling |
| --- | --- | --- |
| `hello` | `{"type":"hello","device":"Android phone"}` | Device label limited to 60 characters |
| `move` | `{"type":"move","dx":4.5,"dy":-2}` | Each axis clamped to ±120 |
| `scroll` | `{"type":"scroll","delta":0.15}` | Delta clamped to ±8 |
| `click` | `{"type":"click","button":"left"}` | Only `left` and `right` accepted |
| `key` | `{"type":"key","key":"playpause"}` or `{"type":"key","key":"enter"}` | Only allowlisted media keys and Enter accepted |
| `text` | `{"type":"text","text":"hello"}` | Text limited to 400 characters and sent to the active Windows app |
| `ready` (server to client) | `{"type":"ready","resumeToken":"..."}` | Sent after authentication |

Allowed keys: `enter`, `backspace`, `volumeup`, `volumedown`, `volumemute`, `playpause`, `next`, and `previous`. Text is limited to 400 characters per message. Payloads are limited to 1,024 bytes. More than 240 messages per second closes the connection. Malformed or unknown messages are ignored.

Text uses Unicode `SendInput` events with the native `INPUT` union layout, including the larger mouse member required for correct structure sizing on 64-bit Windows. The helper reads UTF-8 JSON, checks the number of accepted events, and reports input failures through stderr. Enter and Backspace use virtual-key events. `tools/test-text-input.ps1` verifies real character delivery in a disposable Windows text box, including Unicode, special characters, incremental typing, Enter, Backspace, and newlines. Run it with `powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File tools/test-text-input.ps1`; let its temporary window retain focus until it closes.

## Source layout

```text
setup/                      Windows EXE and Android APK (Git LFS)
src/main.js                 Electron lifecycle, pairing, HTTP/WS server
src/protocol.js             Input normalization and allowlists
src/preload.js              Restricted renderer IPC bridge
src/windows-input.ps1       Windows input injection helper
src/desktop/                Desktop pairing HTML/CSS/JavaScript
src/mobile/                 Optional browser remote
android/app/src/main/       Kotlin Android app, scanner, icon, resources
android/gradle/wrapper/     Gradle wrapper
test/protocol.test.js       Protocol validation tests
INSTALL.txt                 Short end-user setup guide
```

## Build from source

### Clone with setup binaries

Install Git LFS before cloning if you want the installer files locally:

```sh
git lfs install
git clone https://github.com/HashirLodhi/Glide-Remote.git
cd Glide-Remote
git lfs pull
```

Without LFS downloads, the files in `setup/` may be small text pointers rather than installers. Use the direct download links above or run `git lfs pull`. GitHub LFS availability and bandwidth quotas apply.

### Windows desktop

Install Node.js 22.12+ and npm for development and packaging.

```sh
npm ci
npm start
npm test
npm run dist -- --x64
```

`npm start` launches Electron from source. `npm test` runs Node's protocol tests. `npm run dist -- --x64` uses electron-builder/NSIS to produce `dist/Glide Remote.exe`; `npm run pack` produces an unpacked application. Electron 44 and the application's runtime modules are bundled for the recipient. The build configuration copies the PowerShell helper into the installed `resources` directory and uses the Glide icon.

### Android

Use Android Studio or a JDK compatible with Android Gradle Plugin 8.6.1 (JDK 17 recommended), plus Android SDK platform 35. Configure `JAVA_HOME` and `ANDROID_HOME`, or set `sdk.dir` in the ignored `android/local.properties` file.

```powershell
cd android
.\gradlew.bat assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` relative to the repository root. The app uses Kotlin 2.0.21, Gradle 8.7, compile/target SDK 35, and minimum SDK 26. A production Android distribution requires a separately configured release signing key; never commit private signing keys.

## Troubleshooting

**Same Wi-Fi but cannot connect:** Keep the PC app open, click **Generate new code**, then scan immediately inside the Android app. Expired/used QR codes can produce the same generic Android error as a network failure.

If it still fails, open the displayed PC address and port in the phone's browser. If the page fails to load, check the installed EXE's firewall permission, Windows network profile, VPN, and router client isolation. Firewall rules for the development Electron executable do not automatically apply to the installed EXE. Do not disable the firewall.

**Wrong address in the QR:** The current address-selection heuristic may select a virtual/VPN adapter on multi-adapter PCs. Ensure the QR address matches the PC's Wi-Fi IPv4 address. The port changes on restart, so scan the current code.

**Connected but cursor does not move:** Inspect the desktop error status for a failed PowerShell helper. Managed Windows policies may block script execution or input injection. Controlling elevated applications may be restricted by Windows integrity boundaries.

**Scroll differs across apps:** The remote sends fractional wheel deltas, but Windows and the target application determine how those wheel units are rendered. Some applications still scroll in steps.

## Security and limitations

Use only on trusted private networks. Traffic is plain HTTP/WebSocket and is **not encrypted**; the pairing token is a credential. There is no internet relay, TLS setup, or router port-forwarding requirement. Do not expose the server to the internet.

The server uses token checks, timing-safe comparison, payload/rate limits, and an input allowlist. The browser endpoint sends CSP, no-store caching, and other restrictive headers. These controls do not replace transport encryption or make an untrusted Wi-Fi safe.

Current limitations include single-controller sessions, manual Android re-pairing after disconnects, heuristic network-adapter selection, unsigned distribution builds, and no automated physical-device gesture or camera tests. The protocol test suite checks parsing, limits, labels, and allowed commands; a successful build alone does not verify every PC, phone, or router combination.
