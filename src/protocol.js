const INPUT_LIMITS = Object.freeze({ move: 120, scroll: 8 });
const MEDIA_KEYS = new Set(['volumeup', 'volumedown', 'volumemute', 'playpause', 'next', 'previous']);
const TEXT_LIMIT = 400;

function normalizeMessage(raw) {
  let message;
  try { message = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); }
  catch { return null; }
  if (!message || typeof message !== 'object') return null;
  if (message.type === 'hello') return { type: 'hello', device: String(message.device || 'Phone').slice(0, 60) };
  if (message.type === 'move') return { type: 'move', dx: clamp(message.dx, 120), dy: clamp(message.dy, 120) };
  if (message.type === 'scroll') return { type: 'scroll', delta: clamp(message.delta, 8) };
  if (message.type === 'click' && ['left', 'right'].includes(message.button)) return { type: 'click', button: message.button };
  if (message.type === 'key' && (['enter', 'backspace'].includes(message.key) || MEDIA_KEYS.has(message.key))) return { type: 'key', key: message.key };
  if (message.type === 'text' && typeof message.text === 'string') return { type: 'text', text: message.text.slice(0, TEXT_LIMIT) };
  return null;
}

function clamp(value, limit) { return Math.max(-limit, Math.min(limit, Number(value) || 0)); }
module.exports = { normalizeMessage };
