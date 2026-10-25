async function render() {
  const {state} = await chrome.storage.session.get('state');
  document.querySelector('#status').textContent = state?.message || 'Ready: select a resource point or player castle, then press F8 or click the toolbar icon.';
  const settings=await chrome.storage.local.get('activationMode');
  document.querySelector('#stop').disabled = !state?.running && settings.activationMode!=='selection';
  document.querySelector('#log').replaceChildren(...(state?.log || []).map(row => {
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = new Date(row.time).toLocaleTimeString('en-US') + ' ';
    li.append(time, document.createTextNode(row.message));
    return li;
  }));
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.state) void render(); });
document.querySelector('#stop').addEventListener('click', () => chrome.runtime.sendMessage({type: 'stop'}));
document.querySelector('#repair').addEventListener('click', async () => {
  const output = document.querySelector('#repairStatus');
  try {
    const reply = await chrome.runtime.sendMessage({type: 'repairHotkeys'});
    output.textContent = reply?.ok ? `Repaired ${reply.repaired} game tabs; failed: ${reply.failed}. Return to the game and press F8.` : 'Repair failed. Reload the extension and refresh the game.';
  } catch { output.textContent = 'Cannot connect to the extension. Reopen this page.'; }
});
void render();

async function renderMode() {
  const value=await chrome.storage.local.get('activationMode');
  document.querySelector('#activationMode').value=value.activationMode==='selection'?'selection':'manual';
  document.querySelector('#activationMode').disabled=false;
  document.querySelector('#activationStatus').textContent=value.activationMode==='selection'
    ? 'Click-to-run enabled. Select a new resource point or player castle after the game is ready. This mode consumes speedup items.'
    : 'Manual mode. Select a target, then press F8 or click the toolbar icon.';
}
document.querySelector('#activationMode').addEventListener('change',async event=>{
  const mode=event.target.value;event.target.disabled=true;
  try {
    const result=await chrome.runtime.sendMessage({type:'setActivationMode',mode});
    if(!result?.ok)throw new Error('Could not save activation mode.');
    await renderMode();
  } catch(error) {
    event.target.disabled=false;
    document.querySelector('#activationStatus').textContent=error.message;
  }
});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&changes.activationMode){void renderMode();void render();}
});
void renderMode().catch(()=>{document.querySelector('#activationStatus').textContent='Could not load activation mode. Reopen this page.';});
