export function gamePage(url) {
  const u = new URL(url);
  if (u.origin !== 'https://game.gtarcade.com' || u.pathname !== '/game') throw new Error('請選擇 GTarcade 的 /game 遊戲分頁。');
  return u.origin + u.pathname;
}

export function importRecording(recording) {
  if (!Array.isArray(recording?.steps)) throw new Error('不是 Chrome Recorder JSON。');
  // Deliberately discard URLs, navigation assertions and all account/session data.
  const clicks = recording.steps.filter(s => ['click', 'doubleClick'].includes(s.type));
  if (!clicks.length || clicks.length > 100) throw new Error('操作數量必須為 1–100。');
  return clicks.map((s, i) => {
    if (!Number.isFinite(s.offsetX) || !Number.isFinite(s.offsetY)) throw new Error('缺少點擊座標。');
    return {
      name: `錄製步驟 ${i + 1}（待命名）`, enabled: i !== 0,
      kind: s.type === 'doubleClick' ? 'boost' : 'normal',
      type: s.type, delay: 1500, sourceX: s.offsetX, sourceY: s.offsetY,
      x: null, y: null, viewport: null
    };
  });
}

export function validateSteps(steps, allowBoost) {
  if (!Array.isArray(steps) || steps.length > 100) throw new Error('流程格式錯誤。');
  const active = steps.filter(s => s.enabled && (allowBoost || s.kind !== 'boost'));
  if (!active.length) throw new Error('沒有啟用的步驟。');
  for (const s of active) {
    if (!['click', 'doubleClick'].includes(s.type)) throw new Error('不支援的操作。');
    if (!Number.isInteger(s.delay) || s.delay < 0 || s.delay > 30000) throw new Error('等待時間必須為 0–30000 毫秒。');
    const v = s.viewport;
    if (!v || !['width','height','pageX','pageY','scale','zoom'].every(k => Number.isFinite(v[k])) || v.width <= 0 || v.height <= 0 || v.scale <= 0 || v.zoom <= 0) throw new Error(`${s.name} 尚未校準。`);
    if (![s.x, s.y].every(Number.isFinite) || s.x < 0 || s.y < 0 || s.x >= v.width || s.y >= v.height) throw new Error(`${s.name} 的座標超出畫面。`);
  }
  return active;
}

export function sameViewport(a, b) {
  return ['width','height','pageX','pageY','scale','zoom'].every(k => Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 0.01);
}
