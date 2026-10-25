import test from 'node:test';
import assert from 'node:assert/strict';
import {gamePage, runOneClick} from './one-click.mjs';

function harness({inventory = 2, arrive = true, disappear = false, cancel = false} = {}) {
  let clock = 0, cancelled = false, boosted = 0;
  const calls = [];
  const s = {target: 349641, source: 'resource', occupied: false, presets: [{pos: 1, name: 'Spear'}, {pos: 2, name: 'Other'}],
    queues: [], boostInventory: inventory, panel: null};
  const client = {call: async (command, args = {}) => {
    calls.push({command, args});
    if (command === 'open') { s.source = 'dispatch'; s.panel = {preset: 2, soldiers: '20'}; }
    if (command === 'preset') s.panel = {preset: args.preset, soldiers: '1182345'};
    if (command === 'dispatch') s.queues.push({uid: '42', marchId: '1234567890123456', target: '349641', subType: 1, speedupSeconds: 0});
    if (command === 'boost') { s.boostInventory--; boosted++; s.queues[0].speedupSeconds += 14; }
    if (command === 'inspect' && clock > 3500 && s.queues.length) {
      if (disappear) s.queues = [];
      else if (arrive) s.queues[0].subType = 7;
    }
    return structuredClone(s);
  }};
  return {calls, s, run: () => runOneClick(client, structuredClone(s), {
    check: () => { if (cancelled) throw new Error('stopped'); },
    sleep: async ms => { clock += ms; if (cancel && boosted) cancelled = true; },
    now: () => clock, note: () => {}
  })};
}

test('one click selects slot one, dispatches once, caps boosts at two and confirms gathering', async () => {
  const h = harness({inventory: 10});
  const result = await h.run();
  assert.equal(result.arrived, true);
  assert.equal(result.preset, 1);
  assert.equal(h.calls.filter(c => c.command === 'dispatch').length, 1);
  assert.deepEqual(h.calls.filter(c => c.command === 'preset').map(c => c.args.preset), [1]);
  assert.equal(h.calls.filter(c => c.command === 'boost').length, 2);
  assert.equal(h.s.boostInventory, 8);
});
test('zero or one available item still dispatches and waits for arrival', async () => {
  for (const inventory of [0, 1]) {
    const h = harness({inventory});
    assert.equal((await h.run()).arrived, true);
    assert.equal(h.calls.filter(c => c.command === 'boost').length, inventory);
  }
});
test('arrival timeout never sends additional speedups or dispatches', async () => {
  const h = harness({arrive: false});
  await assert.rejects(h.run(), /超過兩分鐘/);
  assert.equal(h.calls.filter(c => c.command === 'boost').length, 2);
  assert.equal(h.calls.filter(c => c.command === 'dispatch').length, 1);
});
test('missing queue and stop during arrival wait never report success', async () => {
  await assert.rejects(harness({disappear: true}).run(), /無法確認抵達/);
  await assert.rejects(harness({cancel: true}).run(), /stopped/);
});
test('missing first preset or selected target fails before mutation; URL allowlist is exact', async () => {
  const a = harness(); a.s.presets = [{pos: 2}];
  await assert.rejects(a.run(), /第一組/); assert.equal(a.calls.length, 0);
  const b = harness(); b.s.target = null;
  await assert.rejects(b.run(), /先選好/); assert.equal(b.calls.length, 0);
  gamePage('https://game.gtarcade.com/game?irrelevant=1');
  for (const url of ['https://evil.test/game', 'https://game.gtarcade.com/other', 'http://game.gtarcade.com/game']) assert.throws(() => gamePage(url));
});

test('toolbar handler rejects other pages, ignores duplicate clicks and detaches on connection failure', async () => {
  const handlers = {}, saved = [], badges = [];
  let attachments = 0, detachments = 0, release;
  const attachGate = new Promise(resolve => { release = resolve; });
  const event = name => ({addListener: fn => { handlers[name] = fn; }});
  globalThis.chrome = {
    storage: {session: {set: async value => saved.push(structuredClone(value))}},
    action: {onClicked: event('click'), setTitle: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeText: async value => badges.push(value.text)},
    debugger: {attach: async () => { attachments++; await attachGate; }, detach: async () => { detachments++; },
      sendCommand: async () => { throw new Error('mock connection failure'); }, onEvent: event('debugEvent'), onDetach: event('detach')},
    commands: {onCommand: event('command')}, tabs: {onUpdated: event('updated')},
    runtime: {getURL: path => 'https://extension.invalid/' + path, onMessage: event('message')}
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok: true, json: async () => ({})});
  try {
    const {start} = await import('./background.js');
    await start({id: 1, url: 'https://example.com'});
    assert.equal(attachments, 0);
    const running = start({id: 2, url: 'https://game.gtarcade.com/game'});
    await start({id: 2, url: 'https://game.gtarcade.com/game'});
    release(); await running;
    assert.equal(attachments, 1);
    assert.equal(detachments, 1);
    assert.equal(saved.at(-1).state.running, false);
    assert.match(saved.at(-1).state.message, /mock connection failure/);
    assert.equal(badges.at(-1), '!');
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});
