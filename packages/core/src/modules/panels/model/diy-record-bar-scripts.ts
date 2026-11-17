import {
  RECORD_BAR_KEY,
  RECORD_FRESH_KEY,
  RECORD_KEY,
} from './diy-record-keys';

export const RECORD_ARM_BAR_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const state = window[KEY];
  const recent = window[BAR];
  if (recent !== null && typeof recent === 'object' && typeof recent.removeResize === 'function') {
    try {
      recent.removeResize();
    } catch (error) {}
  }
  let bar = document.getElementById('__dsh-record-bar');
  if (bar === null) {
    bar = document.createElement('div');
    bar.id = '__dsh-record-bar';
    document.documentElement.appendChild(bar);
  }
  bar.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:#1f2430;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);font:12px/1.5 -apple-system,system-ui,sans-serif');
  let sheet = document.getElementById('__dsh-record-bar-style');
  if (sheet === null) {
    sheet = document.createElement('style');
    sheet.id = '__dsh-record-bar-style';
    sheet.textContent = '@keyframes __dshRecordBreath{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.7)}}#__dsh-record-bar .__dsh-record-dot{animation:__dshRecordBreath 1.1s ease-in-out infinite}';
    const sheetHost = document.head === null || document.head === undefined ? document.documentElement : document.head;
    sheetHost.appendChild(sheet);
  }
  const place = (x, y, width, height) => {
    const rect = bar.getBoundingClientRect();
    const w = typeof width === 'number' ? width : rect.width;
    const h = typeof height === 'number' ? height : rect.height;
    const maxX = Math.max(0, (window.innerWidth || 0) - w);
    const maxY = Math.max(0, (window.innerHeight || 0) - h);
    const left = Math.min(Math.max(0, x), maxX);
    const top = Math.min(Math.max(0, y), maxY);
    state.barX = left;
    state.barY = top;
    bar.style.right = 'auto';
    bar.style.bottom = 'auto';
    bar.style.left = String(left) + 'px';
    bar.style.top = String(top) + 'px';
  };
  const onResize = () => {
    if (typeof state.barX === 'number' && typeof state.barY === 'number') place(state.barX, state.barY);
  };
  window.addEventListener('resize', onResize);
  window[BAR] = {
    bar,
    place,
    removeResize: () => {
      try {
        window.removeEventListener('resize', onResize);
      } catch (error) {}
    },
  };
  return { ok: true };
})()`;

export const RECORD_ARM_BAR_ITEMS_SCRIPT = `(() => {
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const shell = window[BAR];
  if (shell === null || typeof shell !== 'object' || shell.bar === null || typeof shell.bar !== 'object') {
    return { ok: false, code: 'no-bar' };
  }
  const bar = shell.bar;
  bar.textContent = '';
  const grip = document.createElement('span');
  grip.setAttribute('role', 'button');
  grip.setAttribute('tabindex', '0');
  grip.setAttribute('title', '拖动浮条');
  grip.setAttribute('aria-label', '拖动浮条');
  grip.setAttribute('style', 'flex:0 0 auto;width:12px;height:18px;border-radius:3px;cursor:grab;touch-action:none;background-image:radial-gradient(circle,rgba(255,255,255,.5) 1.2px,transparent 1.3px);background-size:6px 6px;background-position:center center');
  const dot = document.createElement('span');
  dot.className = '__dsh-record-dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.setAttribute('style', 'flex:0 0 auto;display:none;width:8px;height:8px;border-radius:999px;corner-shape:round;background:#ef4444');
  const label = document.createElement('span');
  label.setAttribute('style', 'flex:0 0 auto;white-space:nowrap;font-variant-numeric:tabular-nums');
  const look = (on, red, deep) =>
    'display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:0;border-radius:6px;font-size:12px;line-height:1;font-family:inherit;white-space:nowrap;cursor:' +
    (on ? 'pointer' : 'default') +
    ';color:' +
    (on ? '#fff' : 'rgba(255,255,255,.45)') +
    ';background:' +
    (on ? (red ? (deep ? '#dc2626' : '#ef4444') : '#3b82f6') : '#2b3444');
  const start = document.createElement('button');
  const shot = document.createElement('button');
  const end = document.createElement('button');
  start.setAttribute('style', look(false));
  shot.setAttribute('style', look(false));
  end.setAttribute('style', look(false));
  start.type = 'button';
  start.setAttribute('tabindex', '-1');
  start.setAttribute('title', '开始录制');
  start.setAttribute('aria-label', '开始录制');
  start.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="4" width="9" height="8" rx="2"></rect><path d="M10.5 7.4 14.5 5v6l-4-2.4z"></path></svg>开始';
  shot.type = 'button';
  shot.setAttribute('tabindex', '-1');
  shot.setAttribute('title', '拍一张当前页面的截图');
  shot.setAttribute('aria-label', '拍一张当前页面的截图');
  shot.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11"></path><rect x="6" y="6" width="4" height="4" rx="1"></rect></svg>截图';
  end.type = 'button';
  end.setAttribute('tabindex', '-1');
  end.setAttribute('title', '结束录制');
  end.setAttribute('aria-label', '结束录制');
  end.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"></rect></svg>';
  const endText = document.createElement('span');
  endText.textContent = '结束';
  end.appendChild(endText);
  bar.appendChild(grip);
  bar.appendChild(dot);
  bar.appendChild(label);
  bar.appendChild(shot);
  bar.appendChild(start);
  bar.appendChild(end);
  shell.nodes = { grip, dot, label, start, shot, end, endText };
  shell.look = look;
  return { ok: true };
})()`;

export const RECORD_ARM_BAR_WIRING_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const FRESH = ${JSON.stringify(RECORD_FRESH_KEY)};
  const END_WINDOW_MS = 4000;
  const state = window[KEY];
  const shell = window[BAR];
  if (state === null || typeof state !== 'object' || shell === null || typeof shell !== 'object' || shell.nodes === undefined) {
    return { ok: false, code: 'no-bar' };
  }
  const place = shell.place;
  const grip = shell.nodes.grip;
  const dot = shell.nodes.dot;
  const label = shell.nodes.label;
  const start = shell.nodes.start;
  const shot = shell.nodes.shot;
  const end = shell.nodes.end;
  const api = state.__api;
  const keep = api.keep;
  const beatOf = api.beatOf;
  const endText = shell.nodes.endText;
  let armedAt = 0;
  let armTimer = 0;
  const byMouse = (button, run) => (event) => {
    if (event !== undefined && typeof event.detail === 'number' && event.detail === 0) return;
    run();
    if (typeof button.blur === 'function') button.blur();
  };
  const look = shell.look;
  const paint = () => {
    const phase = state.phase;
    const taken = typeof state.shots === 'number' ? state.shots : 0;
    label.textContent = (phase === 'recording' ? '录制中 · ' : phase === 'finished' ? '录制完成 · ' : '录制 · 等开始 · ') + String(state.calls.length) + ' 条' + (taken > 0 ? ' · 已截图 ' + String(taken) + ' 张' : '');
    dot.style.display = phase === 'recording' ? 'inline-block' : 'none';
    start.disabled = phase !== 'armed';
    shot.disabled = phase !== 'recording';
    end.disabled = phase !== 'recording';
    start.setAttribute('style', look(phase === 'armed'));
    shot.setAttribute('style', look(phase === 'recording'));
    end.setAttribute('style', look(phase === 'recording', true, armedAt !== 0));
  };
  const disarm = () => {
    armedAt = 0;
    if (armTimer !== 0) {
      clearTimeout(armTimer);
      armTimer = 0;
    }
    if (endText !== null && endText !== undefined) endText.textContent = '结束';
    paint();
  };
  const arm = () => {
    armedAt = Date.now();
    if (endText !== null && endText !== undefined) endText.textContent = '确认结束';
    if (armTimer !== 0) clearTimeout(armTimer);
    armTimer = setTimeout(disarm, END_WINDOW_MS);
    paint();
  };
  state.__repaint = paint;
  const drag = { on: false, px: 0, py: 0, left: 0, top: 0, w: 0, h: 0 };
  const drop = () => {
    if (!drag.on) return;
    drag.on = false;
    grip.style.cursor = 'grab';
    keep();
  };
  grip.onpointerdown = (event) => {
    const rect = shell.bar.getBoundingClientRect();
    drag.on = true;
    drag.px = event.clientX;
    drag.py = event.clientY;
    drag.left = rect.left;
    drag.top = rect.top;
    drag.w = rect.width;
    drag.h = rect.height;
    grip.style.cursor = 'grabbing';
    if (typeof grip.setPointerCapture === 'function') {
      try {
        grip.setPointerCapture(event.pointerId);
      } catch (error) {}
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };
  grip.onpointermove = (event) => {
    if (!drag.on) return;
    place(drag.left + event.clientX - drag.px, drag.top + event.clientY - drag.py, drag.w, drag.h);
  };
  grip.onpointerup = drop;
  grip.onpointercancel = drop;
  grip.onkeydown = (event) => {
    const step = event.shiftKey ? 40 : 16;
    const rect = shell.bar.getBoundingClientRect();
    const left = event.key === 'ArrowLeft' ? rect.left - step : event.key === 'ArrowRight' ? rect.left + step : rect.left;
    const top = event.key === 'ArrowUp' ? rect.top - step : event.key === 'ArrowDown' ? rect.top + step : rect.top;
    if (left === rect.left && top === rect.top) return;
    place(left, top);
    keep();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };
  start.onclick = byMouse(start, () => {
    if (state.phase !== 'armed') return;
    disarm();
    state.phase = 'recording';
    state.t0 = Date.now();
    state.t1 = null;
    state.href = location.href;
    state.calls = [];
    state.dropped = 0;
    beatOf('start');
    keep();
    paint();
  });
  shot.onclick = byMouse(shot, () => {
    if (state.phase !== 'recording') return;
    state.shots = (typeof state.shots === 'number' ? state.shots : 0) + 1;
    state.shotsAt = Date.now();
    beatOf('shot');
    keep();
    paint();
  });
  end.onclick = byMouse(end, () => {
    if (state.phase !== 'recording') return;
    if (armedAt === 0 || Date.now() - armedAt >= END_WINDOW_MS) {
      arm();
      keep();
      return;
    }
    disarm();
    state.phase = 'finished';
    state.t1 = Date.now();
    beatOf('stop');
    keep();
    paint();
  });
  if (typeof state.barX === 'number' && typeof state.barY === 'number') place(state.barX, state.barY);
  paint();
  return {
    ok: true,
    fresh: window[FRESH] === true,
    phase: state.phase,
    t0: state.t0 === undefined ? null : state.t0,
    t1: state.t1 === undefined ? null : state.t1,
    href: state.href || location.href,
    size: state.calls.length,
    shots: typeof state.shots === 'number' ? state.shots : 0,
    shotsAt: typeof state.shotsAt === 'number' ? state.shotsAt : null,
    dropped: typeof state.dropped === 'number' ? state.dropped : 0,
  };
})()`;
