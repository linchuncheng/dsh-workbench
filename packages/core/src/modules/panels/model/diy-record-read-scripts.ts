import { RECORD_BAR_KEY, RECORD_FRESH_KEY, RECORD_KEY, RECORD_KEEP_KEY, RECORD_OFF_KEY } from './diy-record-scripts';

export const RECORD_READ_SCRIPT = `(async () => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const OFF = ${JSON.stringify(RECORD_OFF_KEY)};
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
  if (state === null || typeof state !== 'object') return { ok: false, code: 'not-armed', phase: 'none', calls: [], hooked: false };
  const page = (hooked) => ({
    ok: true,
    hooked,
    phase: typeof state.phase === 'string' ? state.phase : 'armed',
    t0: state.t0 === undefined ? null : state.t0,
    t1: state.t1 === undefined ? null : state.t1,
    href: typeof state.href === 'string' ? state.href : '',
    here: location.href,
    dropped: typeof state.dropped === 'number' ? state.dropped : 0,
    shots: typeof state.shots === 'number' ? state.shots : 0,
    calls: Array.isArray(state.calls) ? state.calls : [],
    snap: typeof state.snap !== 'object' || state.snap === null ? null : { href: String(state.snap.href === undefined ? '' : state.snap.href), title: String(state.snap.title === undefined ? '' : state.snap.title), bytes: typeof state.snap.bytes === 'number' ? state.snap.bytes : 0, truncated: state.snap.truncated === true, at: typeof state.snap.at === 'number' ? state.snap.at : 0, fields: Array.isArray(state.snap.fields) ? state.snap.fields.length : 0, required: Array.isArray(state.snap.fields) ? state.snap.fields.filter((one) => one !== null && typeof one === 'object' && one.required === true).map((one) => String(one.name === undefined ? '' : one.name)).slice(0, 20) : [] },
  });
  if (typeof window[OFF] !== 'function' || document.getElementById('__dsh-record-bar') === null) return page(false);
  let resolveWake = null;
  const woken = new Promise((resolve) => {
    resolveWake = resolve;
  });
  const onBeat = () => {
    const go = resolveWake;
    resolveWake = null;
    if (go !== null) go();
  };
  window.__dshRecordWake = onBeat;
  let timer = null;
  await Promise.race([woken, new Promise((resolve) => { timer = setTimeout(resolve, BEAT_WAIT); })]);
  if (timer !== null) clearTimeout(timer);
  if (window.__dshRecordWake === onBeat) window.__dshRecordWake = null;
  return page(true);
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
  const glow = document.getElementById('__dsh-record-glow');
  if (glow !== null) glow.remove();
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

export const RECORD_SNAP_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  let state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : null;
  if (state === null) {
    try {
      const raw = sessionStorage.getItem(KEEP);
      state = raw === null ? null : JSON.parse(raw);
    } catch (error) {
      state = null;
    }
  }
  if (state === null || typeof state !== 'object') return { ok: false, code: 'not-armed' };
  const snap = state.snap;
  if (snap === null || typeof snap !== 'object') return { ok: false, code: 'no-snap' };
  return {
    ok: true,
    href: String(snap.href === undefined ? '' : snap.href),
    title: String(snap.title === undefined ? '' : snap.title),
    at: typeof snap.at === 'number' ? snap.at : 0,
    bytes: typeof snap.bytes === 'number' ? snap.bytes : 0,
    truncated: snap.truncated === true,
    html: String(snap.html === undefined ? '' : snap.html),
    fields: Array.isArray(snap.fields) ? snap.fields : [],
  };
})()`;
