import {runNative} from './native-runner.mjs';

export function gamePage(url) {
  const u = new URL(url);
  if (u.origin !== 'https://game.gtarcade.com' || u.pathname !== '/game') {
    throw new Error('Select an available resource point in the GTarcade game tab first.');
  }
}

export async function runOneClick(client, snapshot, deps) {
  const {check, sleep, note, now = () => performance.now()} = deps;
  if (!snapshot.target || !['resource', 'dispatch'].includes(snapshot.source)) {
    throw new Error('Select a resource point first and leave its gathering menu or dispatch panel open.');
  }
  if (!snapshot.presets.some(p => p.pos === 1)) throw new Error('Army preset slot 1 is not configured or loaded.');
  note('Army preset slot 1; speed up until remaining time is ≤ 1 second, with no two-item limit.');
  const result = await runNative(client, {preset: 1, target: snapshot.target, remainingSeconds: 1}, deps);
  note('Waiting for this march to arrive; no further speedup items will be used.');
  const deadline = now() + 120000;
  while (now() < deadline) {
    check();
    const s = await client.call('progress');
    check();
    const q = s.queues.find(q => q.uid === result.queueId && q.marchId === result.marchId && q.target === String(result.target));
    if (!q) throw new Error('This march is no longer in the queue. Cannot confirm arrival; check the game.');
    if (q.subType === 7) {
      note('Arrival and gathering confirmed.');
      return {...result, arrived: true};
    }
    if (q.subType !== 1) throw new Error('This march changed state. Check the game.');
    await sleep(500);
  }
  throw new Error('Dispatch and speedups completed, but arrival was not confirmed within two minutes. Check the game. No additional items were used.');
}
