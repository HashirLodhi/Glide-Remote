const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

function harness() {
  const filename = path.join(__dirname, '../src/main.js');
  const localRequire = createRequire(filename);
  const sent = [];
  const context = vm.createContext({
    require: (name) => name === 'electron' ? {
      app: { whenReady: () => ({ then: () => ({ catch() {} }) }), on() {} },
      ipcMain: { handle() {} },
    } : localRequire(name),
    module: { exports: {} }, __dirname: path.dirname(filename),
    setTimeout, clearTimeout, console, Buffer, process,
    record: (line) => sent.push(JSON.parse(line)),
  });
  vm.runInContext(fs.readFileSync(filename, 'utf8') + `
    inputHelper = { stdin: { writable: true, write: record } };
    const socket = { rateWindow: Date.now(), rateCount: 0 };
    session = { socket };
    globalThis.testApi = {
      send: (message) => handleMessage(socket, JSON.stringify(message)),
      release: () => releaseButton(socket),
      held: () => socket.leftDown,
    };
  `, context);
  return { ...context.testApi, sent };
}

test('selection finishes pending movement before releasing the mouse', () => {
  const h = harness();
  h.send({ type: 'button', button: 'left', action: 'down' });
  h.send({ type: 'move', dx: 12, dy: 3 });
  h.send({ type: 'button', button: 'left', action: 'up' });
  assert.deepEqual(h.sent, [
    { type: 'button', button: 'left', action: 'down' },
    { type: 'move', dx: 12, dy: 3 },
    { type: 'button', button: 'left', action: 'up' },
  ]);
  assert.equal(h.held(), false);
});

test('disconnect cleanup releases a held button exactly once', () => {
  const h = harness();
  h.send({ type: 'button', button: 'left', action: 'down' });
  h.send({ type: 'move', dx: 4, dy: 0 });
  h.release();
  h.release();
  assert.equal(h.held(), false);
  assert.deepEqual(h.sent.map((message) => message.action || message.type), ['down', 'move', 'up']);
});
