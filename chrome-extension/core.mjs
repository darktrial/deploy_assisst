export function gamePage(url) {
  const u = new URL(url);
  if (u.origin !== 'https://game.gtarcade.com' || u.pathname !== '/game') throw new Error('Select the GTarcade /game tab.');
  return u.origin + u.pathname;
}

export function importRecording(recording) {
  if (!Array.isArray(recording?.steps)) throw new Error('Not a Chrome Recorder JSON file.');
  // Deliberately discard URLs, navigation assertions and all account/session data.
  const clicks = recording.steps.filter(s => ['click', 'doubleClick'].includes(s.type));
  if (!clicks.length || clicks.length > 100) throw new Error('The action count must be 1–100.');
  return clicks.map((s, i) => {
    if (!Number.isFinite(s.offsetX) || !Number.isFinite(s.offsetY)) throw new Error('Missing click coordinates.');
    return {
      name: `Recorded step ${i + 1} (unnamed)`, enabled: i !== 0,
      kind: s.type === 'doubleClick' ? 'boost' : 'normal',
      type: s.type, delay: 1500, sourceX: s.offsetX, sourceY: s.offsetY,
      x: null, y: null, viewport: null
    };
  });
}

export function validateSteps(steps, allowBoost) {
  if (!Array.isArray(steps) || steps.length > 100) throw new Error('Invalid workflow format.');
  const active = steps.filter(s => s.enabled && (allowBoost || s.kind !== 'boost'));
  if (!active.length) throw new Error('No steps are enabled.');
  for (const s of active) {
    if (!['click', 'doubleClick'].includes(s.type)) throw new Error('Unsupported operation.');
    if (!Number.isInteger(s.delay) || s.delay < 0 || s.delay > 30000) throw new Error('Delay must be 0–30000 milliseconds.');
    const v = s.viewport;
    if (!v || !['width','height','pageX','pageY','scale','zoom'].every(k => Number.isFinite(v[k])) || v.width <= 0 || v.height <= 0 || v.scale <= 0 || v.zoom <= 0) throw new Error(`${s.name} is not calibrated.`);
    if (![s.x, s.y].every(Number.isFinite) || s.x < 0 || s.y < 0 || s.x >= v.width || s.y >= v.height) throw new Error(`${s.name} has coordinates outside the viewport.`);
  }
  return active;
}

export function sameViewport(a, b) {
  return ['width','height','pageX','pageY','scale','zoom'].every(k => Number.isFinite(a[k]) && Number.isFinite(b[k]) && Math.abs(a[k] - b[k]) < 0.01);
}
