async function render() {
  const {state} = await chrome.storage.session.get('state');
  document.querySelector('#status').textContent = state?.message || '待命：選好資源點後點工具列圖示。';
  document.querySelector('#stop').disabled = !state?.running;
  document.querySelector('#log').replaceChildren(...(state?.log || []).map(row => {
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = new Date(row.time).toLocaleTimeString('zh-TW') + '　';
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
    output.textContent = reply?.ok ? `已修復 ${reply.repaired} 個遊戲分頁；失敗 ${reply.failed} 個。請回遊戲按 F8。` : '修復失敗，請重新載入擴充功能並重新整理遊戲。';
  } catch { output.textContent = '無法連接擴充功能，請重開此頁。'; }
});
void render();
