import {nativeInPage} from './native-page.mjs';

// MAIN-world injection uses the browser API, without debugger or a page message bridge.
export class NativeClient {
  constructor(tabId, executeScript) {
    this.tabId = tabId;
    this.executeScript = executeScript;
    this.selected = null;
  }
  async connect(profile) {
    const results = await this.executeScript({
      target: {tabId: this.tabId, allFrames: true}, world: 'MAIN',
      func: () => !!window.gameInstance?.Module?.HEAPU8 && !!document.querySelector('#unity-canvas')
    });
    const found = results.filter(row => row.result === true);
    if (found.length !== 1 || !found[0].documentId) {
      throw new Error('找不到唯一的 Unity 遊戲環境；請確認網站存取權限並等待遊戲載入。');
    }
    this.selected = {frameId: found[0].frameId, documentId: found[0].documentId};
    this.profile = profile;
    return this.call('inspect', {}, true);
  }
  async call(command, args = {}, verifyHash = false) {
    if (!this.selected) throw new Error('尚未連接 Unity。');
    const results = await this.executeScript({
      target: {tabId: this.tabId, documentIds: [this.selected.documentId]},
      world: 'MAIN', func: nativeInPage, args: [this.profile, command, args, verifyHash, true]
    });
    // A frame ID can be reused after navigation; pin the actual document instead.
    if (results.length !== 1 || results[0].documentId !== this.selected.documentId) {
      throw new Error('遊戲頁面已更換，停止後續操作。');
    }
    const value = results[0].result;
    if (value?.__gtError) throw new Error(value.__gtError);
    if (!value || typeof value !== 'object') throw new Error('Unity 未回傳有效結果，沒有重送指令。');
    return value;
  }
}
