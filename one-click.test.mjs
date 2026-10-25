import test from 'node:test';
import assert from 'node:assert/strict';
import {gamePage, runOneClick} from './one-click.mjs';

function harness({inventory = 2, arrive = true, disappear = false, cancel = false, duration = 60, noAck = false, cancelBoost = false, elapsed = 0} = {}) {
  let clock = 0, cancelled = false, boosted = 0;
  const calls = [];
  const s = {target: 349641, source: 'resource', occupied: false, presets: [{pos: 1, name: 'Spear'}, {pos: 2, name: 'Other'}],
    queues: [], boostInventory: inventory, panel: null};
  const client = {call: async (command, args = {}) => {
    calls.push({command, args});
    if (command === 'open') { s.source = 'dispatch'; s.panel = {preset: 2, soldiers: '20'}; }
    if (command === 'preset') s.panel = {preset: args.preset, soldiers: '1182345'};
    if (command === 'dispatch') s.queues.push({uid: '42', marchId: '1234567890123456', target: '349641', subType: 1, start: 1792893884, finish: 1792893884 + duration, speedupSeconds: 0});
    if (command === 'boost') { boosted++; if (!noAck) { s.boostInventory--; s.queues[0].speedupSeconds += Math.floor((duration-s.queues[0].speedupSeconds)*0.75); } clock += elapsed; if (cancelBoost) cancelled = true; }
    if (command === 'progress' && clock > 500 && s.queues.length) {
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

test('one click selects slot one, dispatches once, boosts beyond two down to one second and confirms gathering', async () => {
  const h = harness({inventory: 10});
  const result = await h.run();
  assert.equal(result.arrived, true);
  assert.equal(result.preset, 1);
  assert.equal(h.calls.filter(c => c.command === 'dispatch').length, 1);
  assert.deepEqual(h.calls.filter(c => c.command === 'preset').map(c => c.args.preset), [1]);
  assert.equal(h.calls.filter(c => c.command === 'boost').length, 3);
  assert.equal(h.s.boostInventory, 7);
  assert.equal(h.s.queues[0].speedupSeconds, 59);
  assert.equal(result.boostsUsed, 3);
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

test('toolbar uses scripting without debugger, ignores duplicate clicks and exposes hotkey rejection', async () => {
  const handlers = {}, saved = [], badges = [];
  let injections = 0, release;
  const attachGate = new Promise(resolve => { release = resolve; });
  const event = name => ({addListener: fn => { handlers[name] = fn; }});
  globalThis.chrome = {
    storage: {session: {set: async value => saved.push(structuredClone(value))}},
    action: {onClicked: event('click'), setTitle: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeText: async value => badges.push(value.text)},
    scripting: {executeScript: async () => { injections++; await attachGate; throw new Error('mock connection failure'); }},
    commands: {onCommand: event('command')}, tabs: {onUpdated: event('updated'),onRemoved:event('removed'),
      get:async()=>({id:2,url:'https://game.gtarcade.com/game',active:false}),query:async()=>[]},
    runtime: {id:'test-extension',getURL: path => 'https://extension.invalid/' + path,onInstalled:event('installed'), onMessage: event('message')}
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ok: true, json: async () => ({})});
  try {
    const {start,repairHotkeys} = await import('./background.js');
    await start({id: 1, url: 'https://example.com'});
    assert.equal(injections, 0);
    const running = start({id: 2, url: 'https://game.gtarcade.com/game'});
    await start({id: 2, url: 'https://game.gtarcade.com/game'});
    release(); await running;
    assert.equal(injections, 1);
    assert.equal(saved.at(-1).state.running, false);
    assert.match(saved.at(-1).state.message, /mock connection failure/);
    assert.equal(badges.at(-1), '!');
    const reply=await new Promise(resolve=>handlers.message({type:'hotkeyRun'},
      {id:'test-extension',url:'https://logins-gotpc.gtarcade.com/login/game',tab:{id:2,url:'https://game.gtarcade.com/game'}},resolve));
    assert.equal(reply.ok,false);assert.match(reply.error,/未啟用/);
    const foreign=await new Promise(resolve=>handlers.message({type:'hotkeyRun'},
      {id:'test-extension',url:'https://example.com',tab:{id:2,url:'https://game.gtarcade.com/game'}},resolve));
    assert.equal(foreign.ok,false);
    const repairs=[];
    chrome.tabs.query=async()=>[{id:2,url:'https://game.gtarcade.com/game'},{id:3,url:'https://game.gtarcade.com/other'}];
    chrome.scripting.executeScript=async injection=>{repairs.push(injection);return [];};
    assert.deepEqual(await repairHotkeys(),{repaired:1,failed:0});
    assert.equal(repairs[0].world,'ISOLATED');
    assert.deepEqual(repairs[0].files,['hotkey.js']);
    assert.equal('func' in repairs[0],false);
  } finally { globalThis.fetch = originalFetch; delete globalThis.chrome; }
});

 test('remaining time threshold includes one second and elapsed time without an extra item', async () => {
  for (const duration of [0, 1]) {
    const h=harness({duration,inventory:10});
    assert.equal((await h.run()).arrived,true);
    assert.equal(h.calls.filter(c=>c.command==='boost').length,0);
  }
  const h=harness({duration:4,inventory:10});
  await h.run(); assert.equal(h.calls.filter(c=>c.command==='boost').length,1);
  const elapsed=harness({duration:8,inventory:10,elapsed:1000,arrive:false});
  await assert.rejects(elapsed.run(),/超過兩分鐘/);
  assert.equal(elapsed.calls.filter(c=>c.command==='boost').length,1);
 });
 test('invalid timing, lost boost acknowledgement and cancellation never spend again', async () => {
  const bad=harness({duration:NaN});
  await assert.rejects(bad.run(),/時間資料/);
  assert.equal(bad.calls.filter(c=>c.command==='boost').length,0);
  const missing=harness({noAck:true,arrive:false});
  await assert.rejects(missing.run(),/加速回應.*逾時/);
  assert.equal(missing.calls.filter(c=>c.command==='boost').length,1);
  const cancelled=harness({cancelBoost:true});
  await assert.rejects(cancelled.run(),/stopped/);
  assert.equal(cancelled.calls.filter(c=>c.command==='boost').length,1);
 });
