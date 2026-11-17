import { RECORD_BAR_KEY, RECORD_FRESH_KEY, RECORD_KEY, RECORD_KEEP_KEY, RECORD_OFF_KEY } from './diy-record-scripts';

export const RECORD_READ_SCRIPT = `(async () => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const BEAT_WAIT = 3000;
  let state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : null;
  if (state === null) {
    try {
      const raw = sessionStorage.getItem(KEEP);
      state = raw === null ? null : JSON.parse(raw);
    } catch (error) {
      state = null;
    }
  }
  if (state === null || typeof state !== 'object') return { ok: false, code: 'not-armed', phase: 'none', calls: [], shots: 0, shotsAt: null, beat: false, beatKind: '' };
  const from = typeof state.beatSeen === 'number' ? state.beatSeen : 0;
  let resolveWake = null;
  const woken = new Promise((resolve) => {
    resolveWake = resolve;
  });
  const onBeat = () => {
    const go = resolveWake;
    resolveWake = null;
    if (go !== null) go();
  };
  window.__dshBeatWake = onBeat;
  const changed = () => (typeof state.beatN === 'number' ? state.beatN : 0) !== from;
  if (!changed()) {
    let timer = null;
    await Promise.race([woken, new Promise((resolve) => { timer = setTimeout(resolve, BEAT_WAIT); })]);
    if (timer !== null) clearTimeout(timer);
  }
  if (window.__dshBeatWake === onBeat) window.__dshBeatWake = null;
  const after = typeof state.beatN === 'number' ? state.beatN : 0;
  const beat = after !== from;
  state.beatSeen = after;
  return { ok: true, phase: typeof state.phase === 'string' ? state.phase : 'armed', t0: state.t0 === undefined ? null : state.t0, t1: state.t1 === undefined ? null : state.t1, href: typeof state.href === 'string' ? state.href : '', here: location.href, dropped: typeof state.dropped === 'number' ? state.dropped : 0, shots: typeof state.shots === 'number' ? state.shots : 0, shotsAt: typeof state.shotsAt === 'number' ? state.shotsAt : null, beat, beatKind: beat && typeof state.beatKind === 'string' ? state.beatKind : '', calls: Array.isArray(state.calls) ? state.calls : [] };
})()`;

export const RECORD_STOP_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const OFF = ${JSON.stringify(RECORD_OFF_KEY)};
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const FRESH = ${JSON.stringify(RECORD_FRESH_KEY)};
  let state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : null;
  if (state === null) {
    try {
      const raw = sessionStorage.getItem(KEEP);
      state = raw === null ? null : JSON.parse(raw);
    } catch (error) {
      state = null;
    }
  }
  let unhooked = 0;
  if (typeof window[OFF] === 'function') {
    try {
      window[OFF]();
      unhooked = 1;
    } catch (error) {}
  }
  const shell = window[BAR];
  if (shell !== null && typeof shell === 'object' && typeof shell.removeResize === 'function') {
    try {
      shell.removeResize();
    } catch (error) {}
  }
  const bar = document.getElementById('__dsh-record-bar');
  if (bar !== null) bar.remove();
  const sheet = document.getElementById('__dsh-record-bar-style');
  if (sheet !== null) sheet.remove();
  try {
    delete window[KEY];
  } catch (error) {
    window[KEY] = undefined;
  }
  try {
    delete window[OFF];
  } catch (error) {
    window[OFF] = undefined;
  }
  try {
    delete window[BAR];
  } catch (error) {
    window[BAR] = undefined;
  }
  try {
    delete window[FRESH];
  } catch (error) {
    window[FRESH] = undefined;
  }
  try {
    sessionStorage.removeItem(KEEP);
  } catch (error) {}
  return { ok: true, unhooked, phase: state !== null && typeof state === 'object' ? state.phase : 'none', t0: state !== null && typeof state === 'object' && state.t0 !== undefined ? state.t0 : null, t1: state !== null && typeof state === 'object' && state.t1 !== undefined ? state.t1 : null, calls: state !== null && typeof state === 'object' && Array.isArray(state.calls) ? state.calls : [], dropped: state !== null && typeof state === 'object' && typeof state.dropped === 'number' ? state.dropped : 0 };
})()`;
