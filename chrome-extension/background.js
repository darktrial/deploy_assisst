import { gamePage, validateSteps, sameViewport } from './core.mjs';
import { TrafficObserver } from './observer.mjs';
import {NativeClient} from './native-client.mjs';
import {runNative,validateNativeOptions} from './native-runner.mjs';

let busy = false;
let state = {running: false, message: '待命', log: []};
let cancelled = false;
let attachedTab = null;
let observationStarting = null;
let nativeClient = null;
const observer = new TrafficObserver({
  command: (source, method, params) => chrome.debugger.sendCommand(source, method, params),
  attach: tabId => chrome.debugger.attach({tabId}, '1.3'),
  detach: tabId => chrome.debugger.detach({tabId}),
  persist: record => record ? chrome.storage.session.set({trafficRecord:record}) : chrome.storage.session.remove('trafficRecord'),
  onEnd: () => { busy = false; }
});
async function startObservation(message) {
  if (busy) throw new Error('請先結束目前的執行、截圖或通訊觀察。');
  busy = true;
  try {
    gamePage((await chrome.tabs.get(message.tabId)).url);
    await chrome.storage.session.remove('trafficRecord');
    return await observer.start(message.tabId, message.includeBinary === true);
  } catch (error) { busy = false; throw error; }
}
async function stopObservation(reason = 'user') {
  if (observationStarting) await observationStarting.catch(() => {});
  return observer.stop(reason);
}
const send = (tabId, method, params = {}) => chrome.debugger.sendCommand({tabId}, method, params);
const note = message => { state.message = message; state.log.push(message); state.log = state.log.slice(-110); };
const check = () => { if (cancelled) throw new Error('流程已停止。'); };
const sleep = async ms => {
  const end = Date.now() + ms;
  while (Date.now() < end) { check(); await new Promise(r => setTimeout(r, Math.min(100, end - Date.now()))); }
  check();
};
async function viewport(tabId) {
  const {cssVisualViewport: v} = await send(tabId, 'Page.getLayoutMetrics');
  if (!v || v.offsetX !== 0 || v.offsetY !== 0) throw new Error('請先還原頁面的觸控縮放與位移。');
  return {width: v.clientWidth, height: v.clientHeight, pageX: v.pageX, pageY: v.pageY, scale: v.scale, zoom: await chrome.tabs.getZoom(tabId)};
}
async function session(tabId, callback) {
  if (busy) throw new Error('另一個操作進行中。');
  busy = true;
  let attached = false;
  try {
    gamePage((await chrome.tabs.get(tabId)).url);
    await chrome.debugger.attach({tabId}, '1.3');
    attached = true; attachedTab = tabId;
    return await callback();
  } finally {
    if (attached) await chrome.debugger.detach({tabId}).catch(() => {});
    attachedTab = null; busy = false;
  }
}
async function capture(tabId) {
  return session(tabId, async () => {
    const before = await viewport(tabId);
    const shot = await send(tabId, 'Page.captureScreenshot', {format: 'png', captureBeyondViewport: false,
      clip: {x: before.pageX, y: before.pageY, width: before.width, height: before.height, scale: 1}});
    if (!sameViewport(before, await viewport(tabId))) throw new Error('截圖時尺寸改變，請重新擷取。');
    return {image: `data:image/png;base64,${shot.data}`, viewport: before, tabId};
  });
}
async function guard(tabId, expected) {
  check();
  const tab = await chrome.tabs.get(tabId);
  gamePage(tab.url);
  if (tab.status !== 'complete' || !tab.active || !(await chrome.windows.get(tab.windowId)).focused) throw new Error('遊戲失去焦點或正在載入，已停止。');
  if (!sameViewport(expected, await viewport(tabId))) throw new Error('視窗尺寸、縮放或捲動改變，請重新校準。');
  check();
}
async function click(tabId, step) {
  const count = step.type === 'doubleClick' ? 2 : 1;
  await send(tabId, 'Input.dispatchMouseEvent', {type: 'mouseMoved', x: step.x, y: step.y});
  for (let i = 1; i <= count; i++) {
    await guard(tabId, step.viewport);
    await send(tabId, 'Input.dispatchMouseEvent', {type: 'mousePressed', x: step.x, y: step.y, button: 'left', buttons: 1, clickCount: i});
    // Always release a pressed button, including when Stop arrives between events.
    try { await new Promise(r => setTimeout(r, 40)); }
    finally { await send(tabId, 'Input.dispatchMouseEvent', {type: 'mouseReleased', x: step.x, y: step.y, button: 'left', buttons: 0, clickCount: i}); }
    check();
    if (i < count) await sleep(70);
  }
}
async function run(message) {
  const steps = validateSteps(message.steps, message.allowBoost === true);
  return session(message.tabId, async () => {
    cancelled = false;
    state = {running: true, message: '', log: []};
    try {
      const tab = await chrome.tabs.get(message.tabId);
      await chrome.tabs.update(tab.id, {active: true});
      await chrome.windows.update(tab.windowId, {focused: true});
      note('3 秒後開始；Alt+Shift+S 停止。');
      await sleep(3000);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        note(`${i + 1}/${steps.length} 等待 ${s.delay}ms：${s.name}`);
        await sleep(s.delay);
        await guard(tab.id, s.viewport);
        await click(tab.id, s);
        note(`已送出點擊：${s.name}`);
      }
      note('流程點擊已送出；請確認遊戲結果。');
    } catch (error) { note(error.message); throw error; }
    finally { state.running = false; }
  });
}
async function nativeSession(tabId, callback) {
  return session(tabId,async()=>{
    nativeClient=new NativeClient(tabId,(source,method,params)=>chrome.debugger.sendCommand(source,method,params));
    try {
      const profile=await (await fetch(chrome.runtime.getURL('native-profile.json'))).json();
      const snapshot=await nativeClient.connect(profile);
      return await callback(nativeClient,snapshot);
    } finally { nativeClient=null; }
  });
}
async function nativeRun(message) {
  const options=validateNativeOptions(message.options||{});
  if(busy)throw new Error('另一個操作進行中。');
  cancelled=false;
  return nativeSession(message.tabId,async client=>{
    state={running:true,message:'',log:[]};
    try { return await runNative(client,options,{check,sleep,note}); }
    catch(error){note(error.message);throw error;}
    finally{state.running=false;}
  });
}
chrome.action.onClicked.addListener(() => chrome.windows.create({url: chrome.runtime.getURL('controller.html'), type: 'popup', width: 1120, height: 880}));
chrome.commands.onCommand.addListener(command => {
  if (command === 'stop') { cancelled = true; stopObservation().catch(() => {}); }
  const stage = {'mark-preset':'preset','mark-march':'march','mark-boost':'boost'}[command];
  if (stage && observer.phase === 'recording') observer.mark(stage, '快捷鍵標記，接著手動操作。');
});
chrome.debugger.onEvent.addListener((source, method, params) => {
  observer.onEvent(source, method, params);
  nativeClient?.onEvent(source,method,params);
});
chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId === attachedTab) cancelled = true;
  observer.onDetach(source, reason);
});
chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (tabId === attachedTab && (changes.status === 'loading' || changes.url)) cancelled = true;
  if (tabId === observer.tabId && observer.accepting() && changes.url) {
    try { gamePage(changes.url); }
    catch { stopObservation('left_game_page').catch(() => {}); }
  }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('controller.html')) return;
  (async () => {
    switch (message.type) {
      case 'tabs': return (await chrome.tabs.query({url: 'https://game.gtarcade.com/*'})).filter(t => { try { gamePage(t.url); return true; } catch { return false; } }).map(t => ({id: t.id, title: t.title}));
      case 'capture': return capture(message.tabId);
      case 'run': return run(message);
      case 'nativeProbe': return nativeSession(message.tabId,async(client,snapshot)=>snapshot);
      case 'nativeRun': return nativeRun(message);
      case 'stop': cancelled = true; await stopObservation(); return true;
      case 'status': return state;
      case 'observeStart': {
        if (observationStarting) throw new Error('通訊觀察正在啟動。');
        observationStarting = startObservation(message);
        try { return await observationStarting; } finally { observationStarting = null; }
      }
      case 'observeMark': return observer.mark(message.stage, message.note);
      case 'observeStop': return stopObservation();
      case 'observeStatus': {
        const status = observer.status();
        if (!status.hasRecord) {
          const saved = (await chrome.storage.session.get('trafficRecord')).trafficRecord;
          if (saved) {
            const markers=saved.events.filter(e=>e.kind==='marker').slice(-12);
            return {...status, phase:'stopped', hasRecord:true, count:saved.events.length, bytes:saved.byteCount, reason:saved.stopReason,
              counts:saved.counts, markers, stage:markers.at(-1)?.label||'baseline', warnings:saved.warnings||[]};
          }
        }
        return status;
      }
      case 'observeExport':
        if (observer.status().active) throw new Error('請先停止觀察再匯出。');
        return observer.record || (await chrome.storage.session.get('trafficRecord')).trafficRecord || null;
      case 'observeClear': return observer.clear();
      default: throw new Error('未知操作。');
    }
  })().then(data => respond({ok: true, data}), error => respond({ok: false, error: error.message}));
  return true;
});
