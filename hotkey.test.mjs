import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('single F8 runs once; repeats, typing, synthetic keys and modifiers are ignored', async () => {
  let listener, sends = 0, prevented = 0;
  const document = {hasFocus: () => true, activeElement: null};
  runInNewContext(await readFile(new URL('./hotkey.js', import.meta.url), 'utf8'), {
    window: {addEventListener: (name, fn, capture) => { assert.equal(name, 'keydown'); assert.equal(capture, true); listener = fn; }},
    document, chrome: {runtime: {sendMessage: async message => { assert.equal(message.type, 'hotkeyRun'); sends++; }}}
  });
  const fire = (overrides = {}) => listener({code: 'F8', isTrusted: true, composedPath: () => [],
    preventDefault: () => { prevented++; }, stopImmediatePropagation: () => {}, ...overrides});
  fire();
  for (const overrides of [{repeat: true}, {isTrusted: false}, {ctrlKey: true}, {altKey: true}, {shiftKey: true},
    {metaKey: true}, {isComposing: true}, {code: 'F7'}, {composedPath: () => [{tagName: 'INPUT'}]},
    {composedPath: () => [{isContentEditable: true}]}]) fire(overrides);
  document.activeElement = {tagName: 'TEXTAREA'}; fire();
  document.activeElement = null; document.hasFocus = () => false; fire();
  assert.equal(sends, 1); assert.equal(prevented, 1);
});
