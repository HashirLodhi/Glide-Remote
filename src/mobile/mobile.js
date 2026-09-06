const params = new URLSearchParams(location.search);
const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
const status = document.querySelector('#status');
const pad = document.querySelector('#pad');
const pairingToken = params.get('token') || '';
let reconnectToken = sessionStorage.getItem('glide-resume-token') || '';
let socket, retryTimer;
let retries = 0, intentionallyClosed = false, triedPairingFallback = false, authenticated = false;
let touches = new Map(), gestureMoved = false, maxTouches = 0, scrollY = 0;
let pendingDx = 0, pendingDy = 0, moveFrame = 0;

function endpoint() { return `${protocol}://${location.host}/ws?token=${encodeURIComponent(reconnectToken || pairingToken)}`; }
function setStatus(label, offline = false) { status.replaceChildren(document.createElement('i'), ` ${label}`); status.classList.toggle('offline', offline); }
function connect() {
  clearTimeout(retryTimer);
  if (intentionallyClosed) return;
  setStatus(retries ? 'Reconnecting' : 'Connecting');
  socket = new WebSocket(endpoint());
  socket.addEventListener('open', () => send({ type: 'hello', device: navigator.platform || 'Phone' }));
  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') {
        authenticated = true;
        if (message.resumeToken) { reconnectToken = message.resumeToken; sessionStorage.setItem('glide-resume-token', reconnectToken); }
        retries = 0; setStatus('Connected');
      }
    } catch { /* Ignore unknown server messages. */ }
  });
  socket.addEventListener('close', () => {
    if (intentionallyClosed) return;
    if (!authenticated && reconnectToken && pairingToken && !triedPairingFallback) {
      triedPairingFallback = true;
      reconnectToken = '';
      sessionStorage.removeItem('glide-resume-token');
    }
    setStatus('Disconnected', true);
    retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retries++, 10_000));
  });
  socket.addEventListener('error', () => socket.close());
}
function send(data) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); }
function sendMove(dx, dy) {
  pendingDx += dx; pendingDy += dy;
  if (moveFrame) return;
  moveFrame = requestAnimationFrame(() => {
    moveFrame = 0;
    const x = pendingDx, y = pendingDy;
    pendingDx = 0; pendingDy = 0;
    if (x || y) send({ type: 'move', dx: x, dy: y });
  });
}
connect();

pad.addEventListener('pointerdown', (event) => {
  pad.setPointerCapture(event.pointerId); touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (touches.size === 1) { gestureMoved = false; maxTouches = 1; } else maxTouches = Math.max(maxTouches, touches.size);
  if (touches.size === 2) scrollY = event.clientY;
});
pad.addEventListener('pointermove', (event) => {
  const previous = touches.get(event.pointerId); if (!previous) return;
  if (touches.size === 1) {
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 1) { gestureMoved = true; sendMove(dx * 1.6, dy * 1.6); }
  } else if (touches.size >= 2) {
    const dy = event.clientY - scrollY;
    if (Math.abs(dy) > 5) { send({ type: 'scroll', delta: Math.sign(dy) }); scrollY = event.clientY; gestureMoved = true; }
  }
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
});
pad.addEventListener('pointerup', (event) => {
  touches.delete(event.pointerId);
  if (touches.size === 0 && !gestureMoved) { send({ type: 'click', button: maxTouches === 2 ? 'right' : 'left' }); navigator.vibrate?.(8); }
});
pad.addEventListener('pointercancel', (event) => { touches.delete(event.pointerId); if (!touches.size) gestureMoved = true; });
document.querySelector('#left').addEventListener('click', () => send({ type: 'click', button: 'left' }));
document.querySelector('#right').addEventListener('click', () => send({ type: 'click', button: 'right' }));
document.querySelectorAll('[data-key]').forEach((button) => button.addEventListener('click', () => send({ type: 'key', key: button.dataset.key })));

const tools = document.createElement('section'); tools.className = 'motion-tools';
tools.innerHTML = '<button id="motion-toggle">⌁ &nbsp; Motion mode</button><button id="recenter" hidden>◎ &nbsp; Recenter</button>';
document.querySelector('main').appendChild(tools);
let motion = false, baseline = null, lastMotion = 0;
function onOrientation(event) {
  if (!motion || event.gamma == null || event.beta == null) return;
  if (!baseline) { baseline = { gamma: event.gamma, beta: event.beta }; return; }
  const now = Date.now(); if (now - lastMotion < 35) return; lastMotion = now;
  const dx = event.gamma - baseline.gamma, dy = event.beta - baseline.beta;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) sendMove(dx * 0.7, dy * 0.7);
}
const motionToggle = document.querySelector('#motion-toggle'), recenter = document.querySelector('#recenter');
motionToggle.addEventListener('click', async () => {
  if (typeof DeviceOrientationEvent === 'undefined') { alert('Motion sensors are not available in this browser.'); return; }
  try { if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') return; }
  catch { alert('Motion permission is unavailable. Use the touchpad instead.'); return; }
  motion = !motion; baseline = null; motionToggle.textContent = motion ? '✓  Motion mode on' : '⌁  Motion mode'; recenter.hidden = !motion;
  if (motion) window.addEventListener('deviceorientation', onOrientation); else window.removeEventListener('deviceorientation', onOrientation);
});
recenter.addEventListener('click', () => { baseline = null; });
window.addEventListener('pagehide', () => { intentionallyClosed = true; clearTimeout(retryTimer); window.removeEventListener('deviceorientation', onOrientation); socket?.close(); });
