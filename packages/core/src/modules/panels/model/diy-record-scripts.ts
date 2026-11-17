import { CALL_CAP, BODY_MAX, RECORD_BAR_KEY, RECORD_FRESH_KEY, RECORD_KEY, RECORD_KEEP_KEY, RECORD_OFF_KEY } from './diy-record-keys';
import {
  RECORD_ARM_BAR_ITEMS_SCRIPT,
  RECORD_ARM_BAR_SCRIPT,
  RECORD_ARM_BAR_WIRING_SCRIPT,
} from './diy-record-bar-scripts';

export {
  RECORD_ARM_BAR_ITEMS_SCRIPT,
  RECORD_ARM_BAR_SCRIPT,
  RECORD_ARM_BAR_WIRING_SCRIPT,
} from './diy-record-bar-scripts';

export {
  RECORD_BAR_KEY,
  RECORD_FRESH_KEY,
  RECORD_KEY,
  RECORD_KEEP_KEY,
  RECORD_OFF_KEY,
} from './diy-record-keys';

export const RECORD_ARM_STATE_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const CAP = ${String(CALL_CAP)};
  const BODY_MAX = ${String(BODY_MAX)};
  const blank = () => ({ phase: 'armed', t0: null, t1: null, href: location.href, dropped: 0, calls: [], shots: 0, shotsAt: null });
  const readKeep = () => {
    try {
      const raw = sessionStorage.getItem(KEEP);
      const parsed = raw === null ? null : JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' ? parsed : blank();
    } catch (error) {
      return blank();
    }
  };
  const state = window[KEY] !== null && typeof window[KEY] === 'object' ? window[KEY] : readKeep();
  state.calls = Array.isArray(state.calls) ? state.calls : [];
  state.phase = typeof state.phase === 'string' ? state.phase : 'armed';
  window[KEY] = state;
  const keep = () => {
    try {
      sessionStorage.setItem(KEEP, JSON.stringify(state));
    } catch (error) {}
  };
  const slice = (value) => {
    try {
      if (value === undefined || value === null || value === '') return '';
      if (typeof value === 'string') return value.slice(0, BODY_MAX);
      if (typeof FormData === 'function' && value instanceof FormData) return '[form-data]';
      if (typeof Blob === 'function' && value instanceof Blob) return '[blob ' + String(value.size) + ']';
      if (typeof URLSearchParams === 'function' && value instanceof URLSearchParams) return String(value).slice(0, BODY_MAX);
      const json = JSON.stringify(value);
      return typeof json === 'string' ? json.slice(0, BODY_MAX) : '';
    } catch (error) {
      return '[unprintable]';
    }
  };
  const repaint = () => {
    if (typeof state.__repaint === 'function') state.__repaint();
  };
  const beatOf = (kind) => {
    try {
      state.beatN = (typeof state.beatN === 'number' ? state.beatN : 0) + 1;
      state.beatKind = kind;
      state.beatAt = Date.now();
      keep();
      if (typeof window.__dshBeatWake === 'function') {
        const wake = window.__dshBeatWake;
        window.__dshBeatWake = null;
        wake();
      }
    } catch (error) {}
  };
  const pending = [];
  const begin = (method, url, body) => {
    if (state.phase !== 'recording') return null;
    const target = String(url === undefined || url === null ? '' : url);
    const verb = String(method === '' || method === undefined ? 'GET' : method).toUpperCase();
    const row = {
      method: verb,
      url: target,
      body: slice(body === undefined || body === null ? '' : body),
      status: 0,
      ct: '',
      response: '',
      at: Date.now(),
    };
    state.calls.push(row);
    if (state.calls.length > CAP) {
      state.dropped = (typeof state.dropped === 'number' ? state.dropped : 0) + (state.calls.length - CAP);
      state.calls.splice(0, state.calls.length - CAP);
    }
    pending.push(row);
    keep();
    repaint();
    return row;
  };
  const complete = (row, status, ct, response) => {
    row.status = typeof status === 'number' ? status : 0;
    row.ct = String(ct === undefined || ct === null ? '' : ct);
    row.response = slice(response === undefined || response === null ? '' : response);
  };
  const record = (method, url, body, status, ct, response) => {
    const row = begin(method, url, body);
    if (row === null) return;
    complete(row, status, ct, response);
    keep();
  };
  const finish = (row, method, url, body, status, ct, response) => {
    const at = row === null || row === undefined ? -1 : pending.indexOf(row);
    if (at >= 0) pending.splice(at, 1);
    if (at >= 0 && state.calls.indexOf(row) >= 0) {
      complete(row, status, ct, response);
      keep();
      repaint();
      return;
    }
    record(method, url, body, status, ct, response);
  };
  state.__api = { begin, finish, keep, beatOf };
  return { ok: true, phase: state.phase, size: state.calls.length };
})()`;

export const RECORD_ARM_NET_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const OFF = ${JSON.stringify(RECORD_OFF_KEY)};
  const FRESH = ${JSON.stringify(RECORD_FRESH_KEY)};
  const END_WINDOW_MS = 4000;
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const state = window[KEY];
  if (state === null || typeof state !== 'object') return { ok: false, code: 'not-armed' };
  if (typeof window[OFF] === 'function') {
    window[FRESH] = false;
    return { ok: true, fresh: false };
  }
  const api = state.__api;
  if (api === null || typeof api !== 'object' || typeof api.begin !== 'function' || typeof api.finish !== 'function') {
    return { ok: false, code: 'not-armed' };
  }
  const begin = api.begin;
  const finish = api.finish;
  const realFetch = window.fetch;
  const proto = XMLHttpRequest.prototype;
  const realOpen = proto.open;
  const realSend = proto.send;
  const realBeacon = typeof navigator === 'object' && navigator !== null ? navigator.sendBeacon : undefined;
  const hasBeacon = typeof realBeacon === 'function';
  const ctOf = (xhr) => {
    try {
      return typeof xhr.getResponseHeader === 'function' ? xhr.getResponseHeader('content-type') || '' : '';
    } catch (error) {
      return '';
    }
  };
  const textOf = (xhr) => {
    try {
      return typeof xhr.responseText === 'string' ? xhr.responseText : '';
    } catch (error) {
      return '';
    }
  };
  window.fetch = function () {
    const args = arguments;
    const init = args[1] || {};
    const asked = args[0];
    const url = typeof asked === 'string' ? asked : asked !== null && typeof asked === 'object' ? asked.url : '';
    const method = init.method !== undefined ? init.method : asked !== null && typeof asked === 'object' ? asked.method : 'GET';
    const body = init.body === undefined ? '' : init.body;
    const row = begin(method, url, body);
    const done = realFetch.apply(this, args);
    try {
      done.then((response) => {
        try {
          const ct = response.headers.get('content-type') || '';
          const clone = response.clone();
          const target = response.url || url;
          clone.text().then((text) => finish(row, method, target, body, response.status, ct, text)).catch(() => finish(row, method, target, body, response.status, ct, ''));
        } catch (error) {}
      }).catch((error) => {
        try {
          finish(row, method, url, body, 0, 'fetch-error', String(error !== null && typeof error === 'object' && error.message !== undefined ? error.message : error));
        } catch (inner) {}
      });
    } catch (error) {}
    return done;
  };
  proto.open = function (method, url) {
    this.__dshMethod = method;
    this.__dshUrl = url;
    return realOpen.apply(this, arguments);
  };
  proto.send = function (body) {
    const xhr = this;
    if (typeof xhr.__dshLoadEnd === 'function' && typeof xhr.removeEventListener === 'function') {
      try {
        xhr.removeEventListener('loadend', xhr.__dshLoadEnd);
      } catch (error) {}
    }
    const row = begin(xhr.__dshMethod, xhr.__dshUrl, body);
    const onEnd = () => {
      try {
        finish(row, xhr.__dshMethod, xhr.__dshUrl, body, xhr.status, ctOf(xhr), textOf(xhr));
      } catch (error) {}
    };
    xhr.__dshLoadEnd = onEnd;
    xhr.addEventListener('loadend', onEnd);
    return realSend.apply(this, arguments);
  };
  if (hasBeacon) {
    navigator.sendBeacon = function (url, data) {
      try {
        begin('POST', url, data === undefined || data === null ? '' : data);
      } catch (error) {}
      return realBeacon.apply(navigator, arguments);
    };
  }
  window[OFF] = () => {
    window.fetch = realFetch;
    proto.open = realOpen;
    proto.send = realSend;
    if (hasBeacon) {
      try {
        navigator.sendBeacon = realBeacon;
      } catch (error) {}
    }
    const shell = window[BAR];
    if (shell !== null && typeof shell === 'object' && typeof shell.removeResize === 'function') {
      try {
        shell.removeResize();
      } catch (error) {}
    }
  };
  window[FRESH] = true;
  return { ok: true, fresh: true };
})()`;

export const RECORD_RESET_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const KEEP = ${JSON.stringify(RECORD_KEEP_KEY)};
  const OFF = ${JSON.stringify(RECORD_OFF_KEY)};
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const FRESH = ${JSON.stringify(RECORD_FRESH_KEY)};
  try {
    sessionStorage.removeItem(KEEP);
  } catch (error) {}
  for (const name of [KEY, OFF, BAR, FRESH]) {
    try {
      delete window[name];
    } catch (error) {}
    window[name] = undefined;
  }
  for (const id of ['__dsh-record-bar', '__dsh-record-bar-style']) {
    const node = document.getElementById(id);
    if (node !== null && node !== undefined && typeof node.remove === 'function') node.remove();
  }
  return { ok: true };
})()`;

export const RECORD_ARM_SCRIPTS = [
  RECORD_ARM_STATE_SCRIPT,
  RECORD_ARM_NET_SCRIPT,
  RECORD_ARM_BAR_SCRIPT,
  RECORD_ARM_BAR_ITEMS_SCRIPT,
  RECORD_ARM_BAR_WIRING_SCRIPT,
] as const;

export const RECORD_ARM_SCRIPT = RECORD_ARM_SCRIPTS.join(';\n');
