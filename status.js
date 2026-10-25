async function render() {
  const {state} = await chrome.storage.session.get('state');
  document.querySelector('#status').textContent = state?.message || 'Ready: select a resource point, then press F8 or click the toolbar icon.';
  document.querySelector('#stop').disabled = !state?.running;
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
