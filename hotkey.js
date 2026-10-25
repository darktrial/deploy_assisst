(() => {
  window.addEventListener('keydown', event => {
    if (event.code !== 'F8' || !event.isTrusted || event.repeat || event.isComposing ||
        event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || !document.hasFocus()) return;
    const editing = node => node && (node.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) || node.getAttribute?.('role') === 'textbox');
    if (event.composedPath().some(editing) || editing(document.activeElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Extension reload invalidates old content scripts until the game is refreshed.
    try { chrome.runtime.sendMessage({type: 'hotkeyRun'}).catch(() => {}); } catch {}
  }, true);
})();
