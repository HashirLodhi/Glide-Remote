const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');
const { normalizeMessage } = require('./protocol');

const PAIRING_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_MESSAGES_PER_SECOND = 240;
const MAX_MESSAGE_BYTES = 1024;
let mainWindow, server, wss, inputHelper, session, heartbeat;
let inputError = null;

function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function localAddress() {
  const candidates = Object.values(os.networkInterfaces()).flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal).map((item) => item.address);
  return candidates.find((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) || candidates[0] || '127.0.0.1';
}
function startInputHelper() {
  if (process.platform !== 'win32') { inputError = 'Input control is supported on Windows only.'; return; }
  const helperPath = app.isPackaged ? path.join(process.resourcesPath, 'windows-input.ps1') : path.join(__dirname, 'windows-input.ps1');
  inputHelper = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  inputError = null;
  inputHelper.stderr.on('data', (data) => { inputError = data.toString().trim() || 'Windows input helper failed'; console.error(`Input helper: ${inputError}`); notifyDesktop(); });
  inputHelper.on('error', (error) => { inputError = error.message; notifyDesktop(); });
  inputHelper.on('exit', (code) => { inputHelper = null; if (code && !app.isQuitting) inputError = `Input helper stopped (${code})`; notifyDesktop(); });
}
function sendInput(message) { if (inputHelper?.stdin.writable) inputHelper.stdin.write(`${JSON.stringify(message)}\n`); }
function queueMove(ws, message) {
  ws.pendingMove = ws.pendingMove || { type: 'move', dx: 0, dy: 0 };
  ws.pendingMove.dx += message.dx;
  ws.pendingMove.dy += message.dy;
  if (ws.moveTimer) return;
  ws.moveTimer = setTimeout(() => flushMove(ws), 8);
}
function flushMove(ws) {
  clearTimeout(ws.moveTimer); ws.moveTimer = null;
  const move = ws.pendingMove; ws.pendingMove = null;
  if (session?.socket === ws && move) sendInput({ type: 'move', dx: Math.max(-120, Math.min(120, move.dx)), dy: Math.max(-120, Math.min(120, move.dy)) });
}
function releaseButton(ws) {
  if (!ws) return;
  flushMove(ws);
  if (ws.leftDown) sendInput({ type: 'button', button: 'left', action: 'up' });
  ws.leftDown = false;
}

function notifyDesktop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('session-status', { connected: Boolean(session?.socket), device: session?.device || null, error: inputError });
}
function handleMessage(ws, raw) {
  if (session?.socket !== ws) return;
  const now = Date.now();
  if (now - ws.rateWindow >= 1000) { ws.rateWindow = now; ws.rateCount = 0; }
  if (++ws.rateCount > MAX_MESSAGES_PER_SECOND) { ws.close(1008, 'Message rate exceeded'); return; }
  const message = normalizeMessage(raw);
  if (!message) return;
  if (message.type === 'hello') { session.device = message.device; notifyDesktop(); }
  else if (message.type === 'move') queueMove(ws, message);
  else {
    flushMove(ws);
    if (message.type === 'button') ws.leftDown = message.action === 'down';
    sendInput(message);
  }
}
function securityHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}
function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const files = { '/': ['mobile.html', 'text/html; charset=utf-8'], '/mobile.css': ['mobile.css', 'text/css; charset=utf-8'], '/mobile.js': ['mobile.js', 'application/javascript; charset=utf-8'] };
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { pathname = ''; }
  const item = files[pathname];
  if (!item) { res.writeHead(404, securityHeaders('text/plain; charset=utf-8')); res.end('Not found'); return; }
  res.writeHead(200, securityHeaders(item[1]));
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(path.join(__dirname, 'mobile', item[0])).pipe(res);
}
async function newSession() {
  releaseButton(session?.socket);
  session?.socket?.close(1000, 'New pairing session');
  const pairingToken = randomToken(), createdAt = Date.now();
  const url = `http://${localAddress()}:${server.address().port}/?token=${pairingToken}`;
  session = { pairingToken, pairingExpiresAt: createdAt + PAIRING_TTL_MS, resumeToken: null, sessionExpiresAt: createdAt + SESSION_TTL_MS, url, qr: await QRCode.toDataURL(url, { width: 440, margin: 1, color: { dark: '#111111', light: '#FAFAF7' } }), socket: null, device: null };
  console.log(`Glide pairing ready on ${localAddress()}:${server.address().port}`);
  notifyDesktop();
  return { url, qr: session.qr, connected: false, device: null, error: inputError };
}
function authenticateUpgrade(req) {
  if (!session || Date.now() > session.sessionExpiresAt) return null;
  let token;
  try { token = new URL(req.url, 'http://localhost').searchParams.get('token'); } catch { return null; }
  if (session.resumeToken && safeEqual(token, session.resumeToken)) return 'resume';
  if (!session.resumeToken && Date.now() <= session.pairingExpiresAt && safeEqual(token, session.pairingToken)) return 'pair';
  return null;
}
function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(serveStatic);
    wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    server.on('upgrade', (req, socket, head) => {
      const authType = authenticateUpgrade(req);
      if (!authType) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
      req.authType = authType;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
    wss.on('connection', (ws, req) => {
      if (req.authType === 'pair') { session.resumeToken = randomToken(); session.pairingToken = null; }
      releaseButton(session.socket);
      session.socket?.close(1000, 'Reconnecting');
      session.socket = ws; ws.isAlive = true; ws.rateWindow = Date.now(); ws.rateCount = 0;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('message', (raw) => handleMessage(ws, raw));
      ws.on('close', () => { clearTimeout(ws.moveTimer); ws.moveTimer = null; if (session?.socket === ws) { releaseButton(ws); session.socket = null; session.device = null; notifyDesktop(); } });
      ws.send(JSON.stringify({ type: 'ready', resumeToken: session.resumeToken }));
      notifyDesktop();
    });
    server.once('error', reject); server.listen(0, '0.0.0.0', resolve);
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1080, height: 720, minWidth: 840, minHeight: 620, backgroundColor: '#f3f2ed', titleBarStyle: 'hidden', titleBarOverlay: { color: '#f3f2ed', symbolColor: '#222' }, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'desktop', 'index.html'));
}
ipcMain.handle('get-session', () => session ? { url: session.url, qr: session.qr, connected: Boolean(session.socket), device: session.device, error: inputError } : null);
ipcMain.handle('new-session', newSession);
app.whenReady().then(async () => {
  startInputHelper(); await startServer(); await newSession(); createWindow();
  heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) ws.terminate(); else { ws.isAlive = false; ws.ping(); } } }, 30_000); heartbeat.unref();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((error) => { console.error('Glide failed to start:', error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { app.isQuitting = true; releaseButton(session?.socket); clearInterval(heartbeat); for (const ws of wss?.clients || []) ws.terminate(); wss?.close(); server?.close(); inputHelper?.kill(); });

module.exports = { safeEqual, securityHeaders };
