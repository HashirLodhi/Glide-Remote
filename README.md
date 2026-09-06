# Glide Remote

Glide turns a phone into a Windows trackpad and media remote over local Wi-Fi. Pair through a QR code; no phone app or account is needed.

## Run

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm start`.
4. Scan the QR code with a phone on the same Wi-Fi.

Run `npm test` for protocol checks, `npm run pack` for an unpacked Windows build,
or `npm run dist` to create the Windows installer.

Windows Firewall may ask for permission on first launch. Allow **Private networks** so the phone can connect.

## Controls

- Drag one finger to move the cursor.
- Tap the pad or use **Left click** to click.
- Use **Right click** for the context menu.
- Drag with two fingers to scroll.
- Use the top row for media and volume controls.

The server permits one phone at a time. Pairing codes are single-use and expire after
10 minutes; an authenticated phone receives a separate reconnect credential valid for
the current session. Sessions expire after eight hours, and closing the desktop app
invalidates them immediately.

## Security model

Glide is intended only for trusted private networks. Input messages are allowlisted,
size-limited, rate-limited, and clamped before reaching Windows. The mobile page uses
restrictive browser security headers, and pairing secrets are never written to logs.

Traffic is not encrypted because ordinary phone browsers do not trust a locally
generated certificate. Do not use Glide on public or untrusted Wi-Fi. Regenerate the
pairing code if it may have been exposed.
