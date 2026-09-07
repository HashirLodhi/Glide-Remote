const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMessage } = require('../src/protocol');

test('allows selection and clipboard commands without arbitrary key injection', () => {
  for (const action of ['down', 'up']) {
    const message = { type: 'button', button: 'left', action };
    assert.deepEqual(normalizeMessage(JSON.stringify(message)), message);
  }
  for (const key of ['copy', 'paste']) {
    assert.deepEqual(normalizeMessage(JSON.stringify({ type: 'key', key })), { type: 'key', key });
  }
  for (const message of [
    { type: 'button', button: 'right', action: 'down' },
    { type: 'button', button: 'left', action: 'toggle' },
    { type: 'button', button: 'left' },
    { type: 'key', key: 'ctrl' },
  ]) assert.equal(normalizeMessage(JSON.stringify(message)), null);
});
test('rejects malformed and unknown messages',()=>{assert.equal(normalizeMessage('{'),null);assert.equal(normalizeMessage('{"type":"nope"}'),null)});
test('clamps movement and scroll input',()=>{assert.deepEqual(normalizeMessage('{"type":"move","dx":999,"dy":-999}'),{type:'move',dx:120,dy:-120});assert.deepEqual(normalizeMessage('{"type":"scroll","delta":20}'),{type:'scroll',delta:8})});
test('allows only supported clicks and media keys',()=>{assert.deepEqual(normalizeMessage('{"type":"click","button":"right"}'),{type:'click',button:'right'});assert.equal(normalizeMessage('{"type":"key","key":"delete"}'),null)});
test('allows enter, backspace, and bounded text input',()=>{assert.deepEqual(normalizeMessage('{"type":"key","key":"enter"}'),{type:'key',key:'enter'});assert.deepEqual(normalizeMessage('{"type":"key","key":"backspace"}'),{type:'key',key:'backspace'});assert.equal(normalizeMessage(JSON.stringify({type:'text',text:'x'.repeat(500)})).text.length,400)});
test('limits device labels',()=>{assert.equal(normalizeMessage(JSON.stringify({type:'hello',device:'x'.repeat(100)})).device.length,60)});
test('normalizes missing and non-numeric values safely',()=>{
  assert.deepEqual(normalizeMessage('{"type":"move","dx":"nope","dy":null}'),{type:'move',dx:0,dy:0});
  assert.deepEqual(normalizeMessage('{"type":"scroll","delta":-999}'),{type:'scroll',delta:-8});
  assert.equal(normalizeMessage('null'),null);
});
test('rejects unsupported button and key variants',()=>{
  assert.equal(normalizeMessage('{"type":"click","button":"middle"}'),null);
  assert.equal(normalizeMessage('{"type":"key","key":"VolumeUp"}'),null);
});
