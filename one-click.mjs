import {runNative} from './native-runner.mjs';

export function gamePage(url) {
  const u = new URL(url);
  if (u.origin !== 'https://game.gtarcade.com' || u.pathname !== '/game') {
    throw new Error('請在 GTarcade 遊戲分頁中，先選好可採集的資源點。');
  }
}

export async function runOneClick(client, snapshot, deps) {
  const {check, sleep, note, now = Date.now} = deps;
  if (!snapshot.target || !['resource', 'dispatch'].includes(snapshot.source)) {
    throw new Error('請先選好資源點，停在採集選單或出征面板。');
  }
  if (!snapshot.presets.some(p => p.pos === 1)) throw new Error('第一組預設列隊尚未設定或未載入。');
  // Keep the explicit two-item ceiling, including when a point takes longer to reach.
  const boosts = Math.min(2, Math.max(0, snapshot.boostInventory));
  note(`第一組預設列隊；本次最多使用 ${boosts} 個加速道具。`);
  const result = await runNative(client, {preset: 1, target: snapshot.target, boosts}, deps);
  note('等待本次行軍抵達；不再追加加速道具。');
  const deadline = now() + 120000;
  while (now() < deadline) {
    check();
    const s = await client.call('inspect');
    check();
    const q = s.queues.find(q => q.uid === result.queueId && q.marchId === result.marchId && q.target === String(result.target));
    if (!q) throw new Error('本次行軍已不在佇列中，無法確認抵達，請查看遊戲。');
    if (q.subType === 7) {
      note('已確認抵達目的地並開始採集。');
      return {...result, arrived: true};
    }
    if (q.subType !== 1) throw new Error('本次行軍狀態已改變，請查看遊戲。');
    await sleep(500);
  }
  throw new Error('已出征並完成允許的加速；等待抵達超過兩分鐘，請查看遊戲。未追加道具。');
}
