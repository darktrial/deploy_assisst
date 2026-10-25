import {NativeClient} from './native-client.mjs';
import {gamePage, runOneClick} from './one-click.mjs';

let busy = false;
let cancelled = false;
let client = null;
let attachedTab = null;
let state = {running: false, message: '待命：選好資源點後點工具列圖示。', log: []};
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
  void chrome.action.setTitle({title: `GT 一鍵出征：${message}`});
}
function check() { if (cancelled) throw new Error('已停止後續操作；已出征的軍隊與已使用的道具不會撤回。'); }
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
  let attached = false;
  state = {running: true, message: '', log: [], startedAt: new Date().toISOString()};
  try {
    gamePage(tab?.url);
    if (!Number.isInteger(tab.id)) throw new Error('找不到目前遊戲分頁。');
    await badge('…', '#2563eb');
    note('連接目前遊戲並檢查版本。');
    await chrome.debugger.attach({tabId: tab.id}, '1.3');
    attached = true;
    attachedTab = tab.id;
    check();
    client = new NativeClient(tab.id, (source, method, params) => chrome.debugger.sendCommand(source, method, params));
    const response = await fetch(chrome.runtime.getURL('native-profile.json'));
    if (!response.ok) throw new Error('無法載入遊戲版本設定。');
    const snapshot = await client.connect(await response.json());
    state.result = await runOneClick(client, snapshot, {check, sleep, note});
    await badge('✓', '#15803d');
  } catch (error) {
    note(error.message || String(error));
    await badge(cancelled ? '停' : '!', '#b45309');
  } finally {
    client = null;
    attachedTab = null;
    if (attached) await chrome.debugger.detach({tabId: tab.id}).catch(() => {});
    state.running = false;
    state.endedAt = new Date().toISOString();
    await persist();
    busy = false;
  }
}

chrome.action.onClicked.addListener(tab => { void start(tab); });
chrome.commands.onCommand.addListener(command => { if (command === 'stop' && busy) cancelled = true; });
chrome.debugger.onEvent.addListener((source, method, params) => client?.onEvent(source, method, params));
chrome.debugger.onDetach.addListener(source => { if (source.tabId === attachedTab) cancelled = true; });
chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (tabId === attachedTab && (changes.status === 'loading' || changes.url)) cancelled = true;
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.type === 'hotkeyRun' && sender.tab) {
    try {
      const origin = new URL(sender.url).origin;
      if (!['https://game.gtarcade.com', 'https://logins-gotpc.gtarcade.com'].includes(origin)) return;
      gamePage(sender.tab.url);
    } catch { return; }
    chrome.tabs.get(sender.tab.id).then(tab => {
      gamePage(tab.url);
      if (!tab.active) throw new Error('遊戲分頁未啟用。');
      void start(tab);
      respond({ok: true});
    }).catch(() => respond({ok: false}));
    return true;
  }
  if (sender.url !== chrome.runtime.getURL('status.html')) return;
  if (message.type === 'stop') { cancelled = true; respond({ok: true}); }
});
