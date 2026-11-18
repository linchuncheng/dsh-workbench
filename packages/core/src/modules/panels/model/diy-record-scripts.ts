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
  const blank = () => ({ phase: 'recording', t0: Date.now(), t1: null, href: location.href, dropped: 0, calls: [], shots: 0 });
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
  const wake = () => {
    try {
      if (typeof window.__dshRecordWake === 'function') {
        const call = window.__dshRecordWake;
        window.__dshRecordWake = null;
        call();
      }
    } catch (error) {}
  };
  const pending = [];
  const begin = (method, url, body) => {
    if (state.phase !== 'recording') return null;
    const target = String(url === undefined || url === null ? '' : url);
    const verb = String(method === '' || method === undefined ? 'GET' : method).toUpperCase();
    if (verb !== 'GET' && typeof state.__api.snapForm === 'function') state.__api.snapForm();
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
  state.__api = { begin, finish, keep, wake };
  keep();
  return { ok: true, phase: state.phase, size: state.calls.length };
})()`;

export const RECORD_ARM_SNAP_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const state = window[KEY];
  if (state === null || typeof state !== 'object') return { ok: false, code: 'not-armed' };
  const keep = state.__api !== undefined && typeof state.__api.keep === 'function' ? state.__api.keep : () => {};
  const SNAP_MAX = 120000;
  const SNAP_PAGES = 3;
  const textOfNode = (node) => {
    const labels = node.labels;
    const first = labels !== undefined && labels !== null && labels.length > 0 ? labels[0] : null;
    const label = first !== null ? first : typeof node.closest === 'function' ? node.closest('label') : null;
    const item = typeof node.closest === 'function' ? node.closest('.ant-form-item') : null;
    const itemLabel = item !== null && item.querySelector !== undefined ? item.querySelector('.ant-form-item-label, label') : null;
    const pick = label !== null && label !== undefined ? label : itemLabel;
    const raw = pick !== null && pick !== undefined && typeof pick.textContent === 'string' ? pick.textContent : '';
    return raw.replace(/\\s+/g, ' ').trim().slice(0, 120);
  };
  const requiredOf = (node, label) => {
    if (node.required === true) return true;
    if (node.getAttribute !== undefined && node.getAttribute('aria-required') === 'true') return true;
    if (/[*＊]\\s*$/.test(label)) return true;
    const item = typeof node.closest === 'function' ? node.closest('.ant-form-item') : null;
    return item !== null && item !== undefined && item.classList !== undefined && item.classList.contains('ant-form-item-required');
  };
  const optionsOf = (node) => {
    const list = node.options;
    if (list === undefined || list === null || typeof list.length !== 'number') return [];
    return Array.prototype.slice.call(list, 0, 20).map((one) => String(one.value === '' ? one.text : one.value + ':' + one.text));
  };
  const fieldsNow = () => {
    const found = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    const rows = [];
    for (let index = 0; index < found.length; index += 1) {
      const node = found[index];
      if (node.type === 'hidden') continue;
      if (typeof node.closest === 'function' && node.closest('#__dsh-record-bar') !== null) continue;
      const label = textOfNode(node);
      const name = String(node.name || node.id || (node.getAttribute !== undefined ? node.getAttribute('aria-label') || '' : '') || label || '').slice(0, 80);
      rows.push({
        name,
        label,
        kind: String(node.tagName || '').toLowerCase() + (node.type === undefined || node.type === '' ? '' : ':' + String(node.type)),
        required: requiredOf(node, label),
        filled: String(node.value === undefined || node.value === null ? '' : node.value) !== '',
        value: String(node.value === undefined || node.value === null ? '' : node.value).slice(0, 120),
        options: optionsOf(node),
      });
      if (rows.length >= 60) break;
    }
    return rows;
  };
  const regionOf = (nodes) => {
    let node = nodes.length > 0 ? nodes[0] : null;
    if (node === null) return null;
    let up = 0;
    while (up < 3 && node.parentElement !== null && node.parentElement !== undefined) {
      const parent = node.parentElement;
      if (parent.querySelector('form') !== null) return parent.querySelector('form');
      if (nodes.every((one) => parent.contains(one))) node = parent;
      up += 1;
    }
    return node.parentElement !== null && node.parentElement !== undefined ? node.parentElement : node;
  };
  const snapForm = () => {
    try {
      const found = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
      if (found.length === 0) return 0;
      const nodes = Array.prototype.slice.call(found);
      const region = regionOf(nodes);
      const html = region !== null && typeof region.outerHTML === 'string' ? region.outerHTML : '';
      const page = {
        at: Date.now(),
        href: location.href,
        title: String(document.title || '').slice(0, 160),
        html: html.slice(0, SNAP_MAX),
        bytes: html.length,
        truncated: html.length > SNAP_MAX,
        fields: fieldsNow(),
      };
      const pages = Array.isArray(state.snapPages) ? state.snapPages : [];
      const kept = pages.filter((one) => one !== null && typeof one === 'object' && one.href !== page.href);
      kept.push(page);
      state.snapPages = kept.slice(Math.max(0, kept.length - SNAP_PAGES));
      state.snap = page;
      return page.fields.length;
    } catch (error) {
      return 0;
    }
  };
  state.__api.snapForm = snapForm;
  return { ok: true };
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
  state.__ready = true;
  if (typeof state.__repaint === 'function') state.__repaint();
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
  return { ok: true };
})()`;

export const RECORD_ARM_SCRIPTS = [
  RECORD_ARM_STATE_SCRIPT,
  RECORD_ARM_BAR_SCRIPT,
  RECORD_ARM_BAR_ITEMS_SCRIPT,
  RECORD_ARM_BAR_WIRING_SCRIPT,
  RECORD_ARM_SNAP_SCRIPT,
  RECORD_ARM_NET_SCRIPT,
] as const;

export const RECORD_ARM_SCRIPT = RECORD_ARM_SCRIPTS.join(';\n');

