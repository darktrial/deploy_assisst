import {NativeClient} from './native-client.mjs';
import {gamePage, runOneClick} from './one-click.mjs';

let busy = false;
let cancelled = false;
let client = null;
let runningTab = null;
let state = {running: false, message: 'Ready: select a resource point, then press F8 or click the toolbar icon.', log: []};
let writes = Promise.resolve();

function persist() {
  const copy = structuredClone(state);
  writes = writes.catch(() => {}).then(() => chrome.storage.session.set({state: copy}));
  return writes;
}
function note(message) {
  // The common native runner announces its stop shortcut through this callback.
  message = message.replaceAll('Alt+Shift+S', 'Alt+Shift+X');
  state.message = message;
  state.log.push({time: new Date().toISOString(), message});
  state.log = state.log.slice(-80);
  void persist();
  void chrome.action.setTitle({title: `GT One-Click Dispatch: ${message}`});
}
function check() { if (cancelled) throw new Error('Stopped further actions. Dispatched troops and consumed items cannot be undone.'); }
async function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    check();
    await new Promise(resolve => setTimeout(resolve, Math.min(100, end - Date.now())));
  }
  check();
}
async function badge(text, color) {
  await chrome.action.setBadgeBackgroundColor({color});
  await chrome.action.setBadgeText({text});
}

export async function start(tab) {
  if (busy) return; // Repeated clicks never queue a second dispatch.
  busy = true;
  cancelled = false;
  state = {running: true, message: '', log: [], startedAt: new Date().toISOString()};
  try {
    gamePage(tab?.url);
    if (!Number.isInteger(tab.id)) throw new Error('Cannot find the current game tab.');
    await badge('…', '#2563eb');
    note('Connecting to the game and checking its version.');
    runningTab = tab.id;
    check();
    client = new NativeClient(tab.id, injection => chrome.scripting.executeScript(injection));
    const response = await fetch(chrome.runtime.getURL('native-profile.json'));
    if (!response.ok) throw new Error('Cannot load the game version profile.');
    const snapshot = await client.connect(await response.json());
    state.result = await runOneClick(client, snapshot, {check, sleep, note});
    await badge('✓', '#15803d');
  } catch (error) {
    note(error.message || String(error));
    await badge(cancelled ? 'STOP' : '!', '#b45309');
  } finally {
    client = null;
    runningTab = null;
    state.running = false;
    state.endedAt = new Date().toISOString();
    try { await persist(); } finally { busy = false; }
  }
}

chrome.action.onClicked.addListener(tab => { void start(tab); });
chrome.commands.onCommand.addListener(command => { if (command === 'stop' && busy) cancelled = true; });
chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (tabId === runningTab && (changes.status === 'loading' || changes.url)) cancelled = true;
});
chrome.tabs.onRemoved.addListener(tabId => { if (tabId === runningTab) cancelled = true; });

export async function repairHotkeys() {
  const tabs = (await chrome.tabs.query({url: 'https://game.gtarcade.com/game*'}))
    .filter(tab => { try { gamePage(tab.url); return true; } catch { return false; } });
  const results = await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true}, world: 'ISOLATED', files: ['hotkey.js']
  })));
  return {repaired: results.filter(r => r.status === 'fulfilled').length, failed: results.filter(r => r.status === 'rejected').length};
}
chrome.runtime.onInstalled.addListener(() => { void repairHotkeys().catch(() => {}); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'hotkeyRun' && sender.tab) {
    try {
      const origin = new URL(sender.url).origin;
      if (!['https://game.gtarcade.com', 'https://logins-gotpc.gtarcade.com'].includes(origin)) throw new Error('Invalid hotkey origin.');
      gamePage(sender.tab.url);
    } catch { respond({ok: false, error: 'Invalid hotkey origin or game tab. Please refresh the game.'}); return; }
    chrome.tabs.get(sender.tab.id).then(tab => {
      gamePage(tab.url);
      if (!tab.active) throw new Error('The game tab is inactive.');
      const status = busy ? 'busy' : 'started';
      void start(tab);
      respond({ok: true, status});
    }).catch(() => respond({ok: false, error: 'The game tab is inactive or closed. Click inside the game first.'}));
    return true;
  }
  if (sender.url !== chrome.runtime.getURL('status.html')) return;
  if (message.type === 'repairHotkeys') {
    repairHotkeys().then(result => respond({ok: true, ...result}), () => respond({ok: false}));
    return true;
  }
  if (message.type === 'stop') { cancelled = true; respond({ok: true}); }
});
