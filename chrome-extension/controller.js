import { importRecording, validateSteps } from './core.mjs';
const $ = id => document.getElementById(id);
let profiles = [], current = 0, selected = null, shot = null, busy = false;
let observing = false, observationStarting = false;
let nativeSnapshot=null, nativeBusy=false;
const profile = () => profiles[current];
const steps = () => profile().steps;
const message = text => { $('status').textContent = text; };
async function api(type, data = {}) {
  const result = await chrome.runtime.sendMessage({type, ...data});
  if (!result?.ok) throw new Error(result?.error || '背景服務沒有回應。');
  return result.data;
}
async function save() { await chrome.storage.local.set({profiles}); }
function on(id, callback) { $(id).addEventListener('click', () => Promise.resolve().then(callback).catch(e => message(e.message))); }
function renderProfiles() {
  $('profiles').replaceChildren(...profiles.map((p, i) => new Option(p.name, String(i))));
  $('profiles').value = String(current);
}
function field(tag, props = {}) { return Object.assign(document.createElement(tag), props); }
function render() {
  $('steps').replaceChildren();
  steps().forEach((s, i) => {
    const row = field('tr', {className: selected === i ? 'selected' : ''});
    const cell = element => { const td = field('td'); td.append(element); row.append(td); };
    const enabled = field('input', {type: 'checkbox', checked: s.enabled});
    enabled.onchange = () => { s.enabled = enabled.checked; save().catch(e => message(e.message)); }; cell(enabled);
    const name = field('input', {type: 'text', value: s.name, maxLength: 100});
    name.onchange = () => { s.name = name.value; save().catch(e => message(e.message)); }; cell(name);
    const type = field('select'); type.append(new Option('單擊', 'click'), new Option('雙擊', 'doubleClick')); type.value = s.type;
    type.onchange = () => { s.type = type.value; save().catch(e => message(e.message)); }; cell(type);
    const delay = field('input', {type: 'number', value: s.delay, min: 0, max: 30000, step: 100});
    delay.onchange = () => { s.delay = Number(delay.value); save().catch(e => message(e.message)); }; cell(delay);
    const boost = field('input', {type: 'checkbox', checked: s.kind === 'boost'});
    boost.onchange = () => { s.kind = boost.checked ? 'boost' : 'normal'; save().catch(e => message(e.message)); }; cell(boost);
    const position = field('small', {textContent: s.viewport ? `已校準 (${s.x}, ${s.y}) · ${s.viewport.width}×${s.viewport.height}` : `待校準 · 原 canvas (${s.sourceX ?? '—'}, ${s.sourceY ?? '—'})`}); cell(position);
    const controls = field('div');
    const calibrate = field('button', {textContent: '校準'}); calibrate.onclick = () => {
      selected = i; render(); $('marker').hidden = true;
      $('calibration').textContent = `正在校準：${s.name}。先擷取對應畫面，再點截圖中的目標。`;
    };
    const remove = field('button', {textContent: '刪除'}); remove.onclick = () => { steps().splice(i, 1); selected = null; render(); save().catch(e => message(e.message)); };
    controls.append(calibrate, remove); cell(controls); $('steps').append(row);
  });
}
async function refresh() {
  const tabs = await api('tabs');
  $('tabs').replaceChildren(...tabs.map(t => new Option(`${t.title || '遊戲'} (#${t.id})`, String(t.id))));
  if (!tabs.length) message('請先在 Chrome 開啟並登入 game.gtarcade.com 的遊戲分頁。');
}
function target() {
  if (!$('tabs').value) throw new Error('找不到遊戲分頁。');
  return Number($('tabs').value);
}
on('refresh', refresh);
on('capture', async () => {
  if (busy) throw new Error('流程執行中。');
  const captured = await api('capture', {tabId: target()});
  shot = captured; $('shot').src = captured.image; $('shot').hidden = false; $('marker').hidden = true;
  $('calibration').textContent = `已擷取 ${shot.viewport.width}×${shot.viewport.height}。選擇步驟的「校準」，再點截圖。`;
});
$('shot').addEventListener('click', async event => {
  try {
    if (!shot || selected === null || !steps()[selected]) throw new Error('先選取步驟的「校準」。');
    if (shot.tabId !== target()) throw new Error('遊戲分頁已切換，請重新擷取。');
    const rect = $('shot').getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * shot.viewport.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * shot.viewport.height);
    Object.assign(steps()[selected], {x, y, viewport: {...shot.viewport}});
    $('marker').hidden = false; $('marker').style.left = `${(event.clientX - rect.left) / rect.width * 100}%`; $('marker').style.top = `${(event.clientY - rect.top) / rect.height * 100}%`;
    await save(); render(); $('calibration').textContent = `已保存 ${steps()[selected].name} 的位置 (${x}, ${y})。`;
  } catch (e) { message(e.message); }
});
$('profiles').onchange = () => { current = Number($('profiles').value); selected = null; $('allowBoost').checked = false; render(); };
on('duplicate', async () => {
  const name = prompt('新 army preset 流程名稱', `Army preset ${profiles.length + 1}`);
  if (!name?.trim()) return;
  profiles.push({name: name.trim().slice(0, 100), steps: structuredClone(steps())}); current = profiles.length - 1; selected = null;
  await save(); renderProfiles(); render();
});
on('rename', async () => {
  const name = prompt('流程名稱', profile().name); if (!name?.trim()) return;
  profile().name = name.trim().slice(0,100); await save(); renderProfiles();
});
on('add', async () => {
  if (steps().length >= 100) throw new Error('最多 100 步。');
  steps().push({name: '新步驟', enabled: true, kind: 'normal', type: 'click', delay: 1500, x: null, y: null, viewport: null});
  await save(); render();
});
function download(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob); const a = field('a', {href: url, download: filename}); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
on('export', () => download({format:'gt-helper-v1', ...profile()}, 'gt-army-preset.json'));
$('import').onchange = async () => {
  try {
    const file = $('import').files[0]; if (!file) return;
    if (file.size > 2_000_000) throw new Error('檔案太大。');
    const data = JSON.parse(await file.text());
    let imported;
    if (data.format === 'gt-helper-v1') {
      if (!Array.isArray(data.steps) || !data.steps.length || data.steps.length > 100) throw new Error('流程格式錯誤。');
      // Whitelist fields; imported coordinates always require fresh calibration.
      imported = data.steps.map((s,i) => ({name: String(s.name || `步驟 ${i+1}`).slice(0,100), enabled: s.enabled === true, kind: s.kind === 'boost' ? 'boost' : 'normal', type: s.type === 'doubleClick' ? 'doubleClick' : 'click', delay: Number.isInteger(s.delay) && s.delay >= 0 && s.delay <= 30000 ? s.delay : 1500, x:null, y:null, viewport:null}));
    } else imported = importRecording(data);
    profiles.push({name: `匯入流程 ${profiles.length + 1}`, steps: imported}); current = profiles.length - 1; selected = null;
    await save(); renderProfiles(); render(); message('已匯入操作；請重新校準。未保存來源網址或登入資料。');
  } catch (e) { message(e.message); }
  finally { $('import').value = ''; }
};
on('run', async () => {
  if (busy) return;
  validateSteps(steps(), $('allowBoost').checked);
  busy = true; $('run').disabled = true;
  try { await api('run', {tabId: target(), steps: structuredClone(steps()), allowBoost: $('allowBoost').checked}); }
  finally { busy = false; $('run').disabled = observing; const status = await api('status'); message(status.log.join('\n')); }
});
on('stop', () => api('stop'));
on('nativeProbe',async()=>{
  nativeSnapshot=null;$('nativeRun').disabled=true;
  nativeBusy=true;$('nativeProbe').disabled=true;
  try {
    const s=await api('nativeProbe',{tabId:target()});
    nativeSnapshot={...s,tabId:target()};
    $('nativePreset').replaceChildren(...s.presets.map(p=>new Option(`${p.pos}. ${p.name}`,String(p.pos))));
    if(s.panel?.preset)$('nativePreset').value=String(s.panel.preset);
    $('nativeStatus').textContent=[`版本：${s.build}（指紋已驗證）`,
      s.target?`目標資源格：${s.target}${s.occupied?'（已被佔用）':''}`:'請手動選一個資源建築物，讓資源資訊視窗顯示後再讀取。',
      `已載入 preset：${s.presets.length} 組；道具 10303 庫存：${s.boostInventory}`,
      s.blockingWindows?.length?`請先處理額外視窗：${s.blockingWindows.join('、')}`:'',
      s.source==='dispatch'?`出征面板：preset ${s.panel.preset}，兵力 ${s.panel.soldiers}`:'',
      '此版入口已做唯讀定位與模擬測試；首次請先選「不使用」加速，核對遊戲結果。'].filter(Boolean).join('\n');
  } finally {nativeBusy=false;$('nativeProbe').disabled=observing||busy;updateNativeControls();}
});
function updateNativeControls(){
  $('nativeRun').disabled=nativeBusy||observing||busy||!nativeSnapshot?.target||nativeSnapshot.occupied||!!nativeSnapshot.blockingWindows?.length||!$('nativePreset').value||nativeSnapshot.tabId!==Number($('tabs').value);
  $('nativeProbe').disabled=nativeBusy||observing||busy;
}
on('nativeRun',async()=>{
  if(!nativeSnapshot||nativeSnapshot.tabId!==target())throw new Error('請重新讀取目前遊戲狀態。');
  busy=true;nativeBusy=true;updateNativeControls();
  try {
    const result=await api('nativeRun',{tabId:target(),options:{preset:Number($('nativePreset').value),target:nativeSnapshot.target,boosts:Number($('nativeBoosts').value)}});
    $('nativeStatus').textContent=`已確認行軍 ${result.marchId}，queue ${result.queueId}。請在遊戲確認採集結果。`;
  } finally {
    busy=false;nativeBusy=false;nativeSnapshot=null;updateNativeControls();
    const status=await api('status');message(status.log.join('\n'));
  }
});
$('nativePreset').onchange=updateNativeControls;
$('tabs').onchange=()=>{nativeSnapshot=null;updateNativeControls();};
const stages={baseline:'背景基準',preset:'選 preset',march:'出征',boost:'加速',done:'操作完成',custom:'其他'};
const reasons={user:'手動停止',time_limit:'已達 10 分鐘',capture_limit:'已達筆數／容量上限',start_failed:'啟動失敗'};
async function refreshObserver() {
  const s=await api('observeStatus'); observing=s.active;
  $('observeStart').disabled=s.active || busy || observationStarting;
  $('observeStop').disabled=!s.active;
  $('observeExport').disabled=s.active || !s.hasRecord;
  $('observeClear').disabled=s.active || !s.hasRecord;
  $('includeBinary').disabled=s.active;
  for (const id of ['markPreset','markMarch','markBoost','markDone']) $(id).disabled=s.phase!=='recording';
  $('run').disabled=s.active || busy;
  updateNativeControls();
  for (const id of ['capture','refresh','tabs']) $(id).disabled=s.active||busy||nativeBusy;
  const c=s.counts || {};
  const lines=[`${s.active ? '觀察中' : s.hasRecord ? '已停止，可匯出' : '待命'} · ${s.count} 筆 · ${Math.round((s.bytes||0)/1024)} KiB`,
    `WebSocket 送出 ${c.wsSent||0}／收到 ${c.wsReceived||0}；HTTP 請求 ${c.httpRequests||0}／回應 ${c.httpResponses||0}`,
    `目前階段：${stages[s.stage]||s.stage}`];
  if (s.reason) lines.push(`停止原因：${reasons[s.reason]||s.reason}`);
  for (const marker of s.markers||[]) lines.push(`${(marker.elapsedMs/1000).toFixed(1)}s · ${stages[marker.label]||marker.label}${marker.note ? ' · '+marker.note : ''}`);
  lines.push(...(s.warnings||[])); if (s.error) lines.push(s.error);
  $('observeStatus').textContent=lines.join('\n');
}
on('observeStart', async()=>{
  if (observationStarting) return;
  observationStarting=true; $('observeStart').disabled=true;
  try { await api('observeStart',{tabId:target(),includeBinary:$('includeBinary').checked}); }
  finally { observationStarting=false; await refreshObserver(); }
});
on('observeStop', async()=>{ await api('observeStop'); await refreshObserver(); });
on('observeExport', async()=>{
  const data=await api('observeExport'); if (!data) throw new Error('沒有可匯出的通訊紀錄。');
  download(data,`gt-traffic-${data.startedAt.replace(/[:.]/g,'-')}.json`);
});
on('observeClear', async()=>{ await api('observeClear'); await refreshObserver(); });
for (const [id,stage] of Object.entries({markPreset:'preset',markMarch:'march',markBoost:'boost',markDone:'done'})) {
  on(id,async()=>{ await api('observeMark',{stage,note:$('observeNote').value}); $('observeNote').value=''; await refreshObserver(); });
}
setInterval(async () => {
  try { const status = await api('status'); if (status.running) message(status.log.join('\n')); await refreshObserver(); }
  catch { /* A closed extension context will be reported by the next user action. */ }
}, 700);
async function init() {
  const saved = await chrome.storage.local.get('profiles');
  if (Array.isArray(saved.profiles) && saved.profiles.length) profiles = saved.profiles;
  else { profiles = [await (await fetch('starter-profile.json')).json()]; await save(); }
  renderProfiles(); render(); await refresh(); await refreshObserver();
}
init().catch(e => message(e.message));
