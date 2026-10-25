import {selectedResource} from './activation.mjs';
import {NativeClient} from './native-client.mjs';
import {gamePage, runOneClick} from './one-click.mjs';

let busy = false;
let cancelled = false;
let client = null;
let runningTab = null;
let state = {running: false, message: 'Ready: select a resource point or player castle, then press F8 or click the toolbar icon.', log: []};
let writes = Promise.resolve();
let automaticRun=false;
async function activationMode() { return (await chrome.storage.local.get('activationMode')).activationMode==='selection'?'selection':'manual'; }
async function stop() {
  cancelled=true;
  // Stopping also disarms click-to-run, including when no march is running.
  await chrome.storage.local.set({activationMode:'manual'});
}
async function connect(tabId, locateOnly=false) {
  const candidate=new NativeClient(tabId,injection=>chrome.scripting.executeScript(injection));
  const response=await fetch(chrome.runtime.getURL('native-profile.json'));
  if(!response.ok)throw new Error('Cannot load the game version profile.');
  const profile=await response.json();
  const snapshot=locateOnly ? (await candidate.locate(profile),null) : await candidate.connect(profile);
  return {candidate,snapshot};
}
async function disableWatch(sender) {
  if(!sender.documentId)return;
  await chrome.scripting.executeScript({target:{tabId:sender.tab.id,documentIds:[sender.documentId]},world:'MAIN',
    func:()=>{window.__gtSelectionWatch?.dispose();delete window.__gtSelectionWatch;}});
}
async function prepareAutomatic(sender) {
  if(await activationMode()!=='selection')return {ok:false};
  const {candidate}=await connect(sender.tab.id,true);
  if(candidate.selected.documentId!==sender.documentId)return {ok:false};
  if(await activationMode()!=='selection')return {ok:false};
  await candidate.call('verify',{},true);
  await candidate.call('watchSelection');
  if(await activationMode()!=='selection'){await disableWatch(sender);return {ok:false};}
  return {ok:true};
}
chrome.storage.onChanged?.addListener((changes,area)=>{
  if(area==='local'&&changes.activationMode && changes.activationMode.newValue!=='selection' && automaticRun)cancelled=true;
});

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

export async function start(tab, automaticSender=null) {
  if (busy) return {ok:true,status:'busy',message:'A run is already active.'}; // Never queue another dispatch.
  busy = true;
  cancelled = false;
  automaticRun = !!automaticSender;
  state = {running: true, message: '', log: [], startedAt: new Date().toISOString()};
  try {
    gamePage(tab?.url);
    if (!Number.isInteger(tab.id)) throw new Error('Cannot find the current game tab.');
    await badge('…', '#2563eb');
    note('Connecting to the game and checking its version.');
    runningTab = tab.id;
    check();
    if(automaticSender && await activationMode()!=='selection')return {ok:false,error:'Automatic activation is disabled.'};
    const connected=await connect(tab.id,!!automaticSender);
    client=connected.candidate;
    let snapshot=connected.snapshot;
    if(automaticSender) {
      if(client.selected.documentId!==automaticSender.documentId)throw new Error('The trigger did not come from the active Unity document. Refresh the game.');
      const selection=await selectedResource(client,{check,sleep,note});
      if(!selection){await badge('', '#2563eb');return {ok:true,status:'ignored',message:state.message};}
      check();
      if(await activationMode()!=='selection')throw new Error('Automatic activation was disabled.');
      note('New target selected. Verifying the game before dispatch.');
      snapshot=await client.call('inspect',{},true);
      const current=await client.call('selection');
      if(snapshot.source!==(selection.kind||'resource')||snapshot.occupied||snapshot.target!==selection.target||current.gestureId!==selection.gestureId)
        throw new Error('Selection changed. No dispatch sent.');
      // Recheck the gesture before every mutation so a newer click cancels this run.
      const call=client.call.bind(client);
      client.call=async(command,args={},verifyHash=false)=>{
        if(['open','preset','dispatch','boost'].includes(command)) {
          check();
          if(await activationMode()!=='selection')throw new Error('Automatic activation was disabled.');
          const current=await call('selection');
          if(!current.focused||current.gestureId!==selection.gestureId)throw new Error('A new interaction interrupted automatic execution.');
          check();
        }
        return call(command,args,verifyHash);
      };
    }
    state.result = await runOneClick(client, snapshot, {check, sleep, note});
    await badge('✓', '#15803d');
    return {ok:true,status:'completed',message:state.message};
  } catch (error) {
    note(error.message || String(error));
    await badge(cancelled ? 'STOP' : '!', '#b45309');
    return {ok:false,error:state.message};
  } finally {
    automaticRun = false;
    client = null;
    runningTab = null;
    state.running = false;
    state.endedAt = new Date().toISOString();
    try { await persist(); } finally { busy = false; }
  }
}

chrome.action.onClicked.addListener(tab => { void start(tab); });
chrome.commands.onCommand.addListener(command => { if (command === 'stop') void stop(); });
chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (tabId === runningTab && (changes.status === 'loading' || changes.url)) cancelled = true;
});
chrome.tabs.onRemoved.addListener(tabId => { if (tabId === runningTab) cancelled = true; });

export async function repairHotkeys() {
  const tabs = (await chrome.tabs.query({url: 'https://game.gtarcade.com/game*'}))
    .filter(tab => { try { gamePage(tab.url); return true; } catch { return false; } });
  const results = await Promise.allSettled(tabs.map(tab => chrome.scripting.executeScript({
    target: {tabId: tab.id, allFrames: true}, world: 'ISOLATED', files: ['hotkey.js','auto-trigger.js']
  })));
  return {repaired: results.filter(r => r.status === 'fulfilled').length, failed: results.filter(r => r.status === 'rejected').length};
}
chrome.runtime.onInstalled.addListener(() => { void repairHotkeys().catch(() => {}); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (['hotkeyRun','autoRun','autoPrepare','autoDisable'].includes(message.type) && sender.tab) {
    try {
      const origin = new URL(sender.url).origin;
      if (!['https://game.gtarcade.com', 'https://logins-gotpc.gtarcade.com'].includes(origin)) throw new Error('Invalid hotkey origin.');
      gamePage(sender.tab.url);
    } catch { respond({ok: false, error: 'Invalid hotkey origin or game tab. Please refresh the game.'}); return; }
    if(message.type==='autoDisable') {
      disableWatch(sender).then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
    }
    if(message.type==='autoPrepare') {
      prepareAutomatic(sender).then(respond,error=>respond({ok:false,error:error.message}));return true;
    }
    chrome.tabs.get(sender.tab.id).then(async tab => {
      gamePage(tab.url);
      if (!tab.active) throw new Error('The game tab is inactive.');
      if(message.type==='autoRun' && (!sender.documentId || await activationMode()!=='selection')){respond({ok:false});return;}
      if(message.type==='autoRun'){respond(await start(tab,sender));return;}
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
  if(message.type==='setActivationMode') {
    if(!['manual','selection'].includes(message.mode)){respond({ok:false});return;}
    if(automaticRun)cancelled=true;
    chrome.storage.local.set({activationMode:message.mode}).then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
  }
  if (message.type === 'stop') { stop().then(()=>respond({ok:true}),()=>respond({ok:false}));return true; }
});
