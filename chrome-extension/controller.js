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
  if (!result?.ok) throw new Error(result?.error || 'The background service did not respond.');
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
    const type = field('select'); type.append(new Option('Single click', 'click'), new Option('Double click', 'doubleClick')); type.value = s.type;
    type.onchange = () => { s.type = type.value; save().catch(e => message(e.message)); }; cell(type);
    const delay = field('input', {type: 'number', value: s.delay, min: 0, max: 30000, step: 100});
    delay.onchange = () => { s.delay = Number(delay.value); save().catch(e => message(e.message)); }; cell(delay);
    const boost = field('input', {type: 'checkbox', checked: s.kind === 'boost'});
    boost.onchange = () => { s.kind = boost.checked ? 'boost' : 'normal'; save().catch(e => message(e.message)); }; cell(boost);
    const position = field('small', {textContent: s.viewport ? `Calibrated (${s.x}, ${s.y}) · ${s.viewport.width}×${s.viewport.height}` : `Not calibrated · original canvas (${s.sourceX ?? '—'}, ${s.sourceY ?? '—'})`}); cell(position);
    const controls = field('div');
    const calibrate = field('button', {textContent: 'Calibrate'}); calibrate.onclick = () => {
      selected = i; render(); $('marker').hidden = true;
      $('calibration').textContent = `Calibrating: ${s.name}. Capture the matching screen, then click the target in the screenshot.`;
    };
    const remove = field('button', {textContent: 'Delete'}); remove.onclick = () => { steps().splice(i, 1); selected = null; render(); save().catch(e => message(e.message)); };
    controls.append(calibrate, remove); cell(controls); $('steps').append(row);
  });
}
async function refresh() {
  const tabs = await api('tabs');
  $('tabs').replaceChildren(...tabs.map(t => new Option(`${t.title || 'Game'} (#${t.id})`, String(t.id))));
  if (!tabs.length) message('Open the game tab at game.gtarcade.com in Chrome and sign in first.');
}
function target() {
  if (!$('tabs').value) throw new Error('Cannot find a game tab.');
  return Number($('tabs').value);
}
on('refresh', refresh);
on('capture', async () => {
  if (busy) throw new Error('Workflow is running.');
  const captured = await api('capture', {tabId: target()});
  shot = captured; $('shot').src = captured.image; $('shot').hidden = false; $('marker').hidden = true;
  $('calibration').textContent = `Captured ${shot.viewport.width}×${shot.viewport.height}. Select Calibrate for a step, then click the screenshot.`;
});
$('shot').addEventListener('click', async event => {
  try {
    if (!shot || selected === null || !steps()[selected]) throw new Error('Select Calibrate for a step first.');
    if (shot.tabId !== target()) throw new Error('The game tab changed. Capture again.');
    const rect = $('shot').getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * shot.viewport.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * shot.viewport.height);
    Object.assign(steps()[selected], {x, y, viewport: {...shot.viewport}});
    $('marker').hidden = false; $('marker').style.left = `${(event.clientX - rect.left) / rect.width * 100}%`; $('marker').style.top = `${(event.clientY - rect.top) / rect.height * 100}%`;
    await save(); render(); $('calibration').textContent = `Saved ${steps()[selected].name} position (${x}, ${y}).`;
  } catch (e) { message(e.message); }
});
$('profiles').onchange = () => { current = Number($('profiles').value); selected = null; $('allowBoost').checked = false; render(); };
on('duplicate', async () => {
  const name = prompt('New army preset workflow name', `Army preset ${profiles.length + 1}`);
  if (!name?.trim()) return;
  profiles.push({name: name.trim().slice(0, 100), steps: structuredClone(steps())}); current = profiles.length - 1; selected = null;
  await save(); renderProfiles(); render();
});
on('rename', async () => {
  const name = prompt('Workflow name', profile().name); if (!name?.trim()) return;
  profile().name = name.trim().slice(0,100); await save(); renderProfiles();
});
on('add', async () => {
  if (steps().length >= 100) throw new Error('Maximum 100 steps.');
  steps().push({name: 'New step', enabled: true, kind: 'normal', type: 'click', delay: 1500, x: null, y: null, viewport: null});
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
    if (file.size > 2_000_000) throw new Error('File is too large.');
    const data = JSON.parse(await file.text());
    let imported;
    if (data.format === 'gt-helper-v1') {
      if (!Array.isArray(data.steps) || !data.steps.length || data.steps.length > 100) throw new Error('Invalid workflow format.');
      // Whitelist fields; imported coordinates always require fresh calibration.
      imported = data.steps.map((s,i) => ({name: String(s.name || `Step ${i+1}`).slice(0,100), enabled: s.enabled === true, kind: s.kind === 'boost' ? 'boost' : 'normal', type: s.type === 'doubleClick' ? 'doubleClick' : 'click', delay: Number.isInteger(s.delay) && s.delay >= 0 && s.delay <= 30000 ? s.delay : 1500, x:null, y:null, viewport:null}));
    } else imported = importRecording(data);
    profiles.push({name: `Imported workflow ${profiles.length + 1}`, steps: imported}); current = profiles.length - 1; selected = null;
    await save(); renderProfiles(); render(); message('Actions imported. Recalibrate before running. Source URLs and login data were not saved.');
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
    $('nativeStatus').textContent=[`Build: ${s.build} (fingerprint verified)`,
      s.target?`Target resource grid: ${s.target}${s.occupied?' (occupied)':''}`:'Select a resource building manually, leave its information window open, then read the state.',
      `Loaded presets: ${s.presets.length}; item 10303 inventory: ${s.boostInventory}`,
      s.blockingWindows?.length?`Resolve these dialogs first: ${s.blockingWindows.join(', ')}`:'',
      s.source==='dispatch'?`Dispatch panel: preset ${s.panel.preset}, troops ${s.panel.soldiers}`:'',
      'Native entries were inspected and tested with mocks. For your first run, select No speedups and check the game result.'].filter(Boolean).join('\n');
  } finally {nativeBusy=false;$('nativeProbe').disabled=observing||busy;updateNativeControls();}
});
function updateNativeControls(){
  $('nativeRun').disabled=nativeBusy||observing||busy||!nativeSnapshot?.target||nativeSnapshot.occupied||!!nativeSnapshot.blockingWindows?.length||!$('nativePreset').value||nativeSnapshot.tabId!==Number($('tabs').value);
  $('nativeProbe').disabled=nativeBusy||observing||busy;
}
on('nativeRun',async()=>{
  if(!nativeSnapshot||nativeSnapshot.tabId!==target())throw new Error('Read the current game state again.');
  busy=true;nativeBusy=true;updateNativeControls();
  try {
    const result=await api('nativeRun',{tabId:target(),options:{preset:Number($('nativePreset').value),target:nativeSnapshot.target,boosts:Number($('nativeBoosts').value)}});
    $('nativeStatus').textContent=`Confirmed march ${result.marchId}, queue ${result.queueId}. Check the gathering result in the game.`;
  } finally {
    busy=false;nativeBusy=false;nativeSnapshot=null;updateNativeControls();
    const status=await api('status');message(status.log.join('\n'));
  }
});
$('nativePreset').onchange=updateNativeControls;
$('tabs').onchange=()=>{nativeSnapshot=null;updateNativeControls();};
const stages={baseline:'Baseline',preset:'Select preset',march:'Dispatch',boost:'Speedup',done:'Actions complete',custom:'Other'};
const reasons={user:'Stopped by user',time_limit:'10-minute limit reached',capture_limit:'Event or size limit reached',start_failed:'Start failed'};
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
  const lines=[`${s.active ? 'Observing' : s.hasRecord ? 'Stopped; ready to export' : 'Ready'} · ${s.count} events · ${Math.round((s.bytes||0)/1024)} KiB`,
    `WebSocket sent ${c.wsSent||0} / received ${c.wsReceived||0}; HTTP requests ${c.httpRequests||0} / responses ${c.httpResponses||0}`,
    `Current stage: ${stages[s.stage]||s.stage}`];
  if (s.reason) lines.push(`Stop reason: ${reasons[s.reason]||s.reason}`);
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
  const data=await api('observeExport'); if (!data) throw new Error('No traffic record to export.');
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
