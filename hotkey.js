(() => {
  const previous = globalThis.__gtOneClickHotkey;
  previous?.dispose();
  let downHandled = false;
  let notice = null;
  let timer;
  function show(message) {
    notice?.remove();
    clearTimeout(timer);
    notice = document.createElement('div');
    notice.textContent = `GT One-Click Dispatch: ${message}`;
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#182538;color:white;padding:10px 14px;border-radius:8px;font:14px/1.5 sans-serif;max-width:420px;pointer-events:none';
    document.documentElement.appendChild(notice);
    timer = setTimeout(() => { notice?.remove(); notice = null; }, 4500);
  }
  function eligible(event) {
    if ((event.code !== 'F8' && event.key !== 'F8') || !event.isTrusted || event.repeat || event.isComposing ||
        event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || !document.hasFocus()) return false;
    const editing = node => node && (node.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) || node.getAttribute?.('role') === 'textbox');
    return !event.composedPath().some(editing) && !editing(document.activeElement);
  }
  function trigger(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      chrome.runtime.sendMessage({type: 'hotkeyRun'}).then(reply => {
        if (!reply?.ok) show(reply?.error || 'Hotkey disconnected. Refresh the game or click Repair F8 in Options.');
        else show(reply.status === 'busy' ? 'A run is already active. Duplicate key press ignored.' : 'F8 received. Checking the target; see the toolbar icon or execution log for results.');
      }).catch(() => show('The extension was reloaded or disconnected. Please refresh the game.'));
    } catch { show('The extension was reloaded. Please refresh the game.'); }
  }
  function keydown(event) {
    if (!event.isTrusted || (event.code !== 'F8' && event.key !== 'F8')) return;
    // Remember rejected keydowns too: releasing Ctrl before F8 must not trigger a run.
    downHandled = true;
    if (!eligible(event)) return;
    trigger(event);
  }
  function keyup(event) {
    if (!event.isTrusted || (event.code !== 'F8' && event.key !== 'F8')) return;
    const handled = downHandled;
    downHandled = false;
    // Unity or an invalidated old script may consume keydown before this handler.
    if (!handled && eligible(event)) trigger(event);
  }
  function blur() { downHandled = false; }
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);
  window.addEventListener('blur', blur);
  globalThis.__gtOneClickHotkey = {dispose() {
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('blur', blur);
    notice?.remove(); clearTimeout(timer);
  }};
})();
