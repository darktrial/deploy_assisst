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
void render();
