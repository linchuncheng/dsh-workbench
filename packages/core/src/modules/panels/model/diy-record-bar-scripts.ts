import {
  RECORD_BAR_KEY,
  RECORD_FRESH_KEY,
  RECORD_KEY,
} from './diy-record-keys';

export const RECORD_ARM_BAR_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  if (window[KEY] === null || typeof window[KEY] !== 'object') {
    window[KEY] = { phase: 'recording', t0: Date.now(), t1: null, href: location.href, dropped: 0, calls: [], shots: 0 };
  }
  const state = window[KEY];
  const recent = window[BAR];
  const shell = recent !== null && typeof recent === 'object' ? recent : {};
  if (recent !== null && typeof recent === 'object' && typeof recent.removeResize === 'function') {
    try {
      recent.removeResize();
    } catch (error) {}
  }
  let bar = document.getElementById('__dsh-record-bar');
  if (bar === null) {
    bar = document.createElement('div');
    bar.id = '__dsh-record-bar';
    bar.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:#1f2430;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.35);font:12px/1.5 -apple-system,system-ui,sans-serif');
    document.documentElement.appendChild(bar);
  }
  let glow = document.getElementById('__dsh-record-glow');
  if (glow === null) {
    glow = document.createElement('div');
    glow.id = '__dsh-record-glow';
    document.documentElement.appendChild(glow);
  }
  glow.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;border:3px solid rgba(96,165,250,.9);box-shadow:inset 0 0 34px rgba(96,165,250,.55),inset 0 0 110px rgba(96,165,250,.4);animation:__dshRecordGlow 2.4s ease-in-out infinite');
  if (shell.nodes === undefined) {
  bar.textContent = '';
  const grip = document.createElement('span');
  grip.setAttribute('role', 'button');
  grip.setAttribute('tabindex', '0');
  grip.setAttribute('title', '拖动浮条');
  grip.setAttribute('aria-label', '拖动浮条');
  grip.setAttribute('style', 'flex:0 0 auto;align-self:center;width:12px;height:18px;border-radius:3px;cursor:grab;touch-action:none;background-image:radial-gradient(circle,rgba(255,255,255,.5) 1.2px,transparent 1.3px);background-size:6px 6px;background-position:center center');
  const dot = document.createElement('span');
  dot.className = '__dsh-record-dot';
  dot.setAttribute('aria-hidden', 'true');
  dot.setAttribute('style', 'flex:0 0 auto;display:none;width:8px;height:8px;border-radius:999px;corner-shape:round;background:#ef4444');
  const label = document.createElement('span');
  label.setAttribute('style', 'flex:0 0 auto;white-space:nowrap;font-variant-numeric:tabular-nums');
  label.textContent = '正在准备录制…';
  const look = (on, red, deep) =>
    'display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:0;border-radius:6px;font-size:12px;line-height:1;font-family:inherit;white-space:nowrap;cursor:' +
    (on ? 'pointer' : 'default') +
    ';color:' +
    (on ? '#fff' : 'rgba(255,255,255,.45)') +
    ';background:' +
    (on ? (red ? (deep ? '#dc2626' : '#ef4444') : '#3b82f6') : '#2b3444');
  const shot = document.createElement('button');
  const end = document.createElement('button');
  shot.setAttribute('style', look(false));
  end.setAttribute('style', look(false));
  shot.type = 'button';
  shot.setAttribute('tabindex', '-1');
  shot.setAttribute('title', '拍一张当前页面的截图');
  shot.setAttribute('aria-label', '拍一张当前页面的截图');
  shot.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" style="display:block;flex:0 0 auto" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5V1.5H5M11 1.5h3.5V5M14.5 11v3.5H11M5 14.5H1.5V11"></path><rect x="6" y="6" width="4" height="4" rx="1"></rect></svg>截图';
  end.type = 'button';
  end.setAttribute('tabindex', '-1');
  end.setAttribute('title', '结束录制');
  end.setAttribute('aria-label', '结束录制');
  end.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" style="display:block;flex:0 0 auto" aria-hidden="true" focusable="false"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"></rect></svg>';
  const endText = document.createElement('span');
  endText.textContent = '结束';
  end.appendChild(endText);
  bar.appendChild(grip);
  bar.appendChild(dot);
  bar.appendChild(label);
  bar.appendChild(shot);
  bar.appendChild(end);
  shell.nodes = { grip, dot, label, shot, end };
  shell.look = look;
  bar.style.display = 'flex';
  label.textContent = '正在准备录制…';
  dot.style.display = 'none';
  shot.disabled = true;
  end.disabled = true;
  shot.setAttribute('style', look(false));
  end.setAttribute('style', look(false, true, false));
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
    ...shell,
    bar,
    glow,
    place,
    removeResize: () => {
      try {
        window.removeEventListener('resize', onResize);
      } catch (error) {}
    },
  };
  return { ok: true, href: location.href };
})()`;

export const RECORD_ARM_BAR_ITEMS_SCRIPT = `(() => {
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const shell = window[BAR];
  if (shell === null || typeof shell !== 'object' || shell.bar === null || typeof shell.bar !== 'object') {
    return { ok: false, code: 'no-bar' };
  }
  let sheet = document.getElementById('__dsh-record-bar-style');
  if (sheet === null) {
    sheet = document.createElement('style');
    sheet.id = '__dsh-record-bar-style';
    sheet.textContent = '@keyframes __dshRecordBreath{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.7)}}#__dsh-record-bar .__dsh-record-dot{animation:__dshRecordBreath 1.1s ease-in-out infinite}@keyframes __dshRecordGlow{0%,100%{opacity:.55}50%{opacity:1}}@keyframes __dshRecordSpin{to{transform:rotate(360deg)}}';
    const sheetHost = document.head === null || document.head === undefined ? document.documentElement : document.head;
    sheetHost.appendChild(sheet);
  }
  if (shell.nodes !== undefined) {
    shell.bar.style.display = 'flex';
    return { ok: true, reused: true };
  }
})()`;

export const RECORD_ARM_BAR_WIRING_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(RECORD_KEY)};
  const BAR = ${JSON.stringify(RECORD_BAR_KEY)};
  const FRESH = ${JSON.stringify(RECORD_FRESH_KEY)};
  const state = window[KEY];
  const shell = window[BAR];
  if (state === null || typeof state !== 'object' || shell === null || typeof shell !== 'object' || shell.nodes === undefined) {
    return { ok: false, code: 'no-bar' };
  }
  const place = shell.place;
  const grip = shell.nodes.grip;
  const dot = shell.nodes.dot;
  const label = shell.nodes.label;
  const shot = shell.nodes.shot;
  const end = shell.nodes.end;
  const glow = document.getElementById('__dsh-record-glow');
  const api = state.__api;
  const keep = api.keep;
  const wake = api.wake;
  const byMouse = (button, run) => (event) => {
    if (event !== undefined && typeof event.detail === 'number' && event.detail === 0) return;
    run();
    if (typeof button.blur === 'function') button.blur();
  };
  const look = shell.look;
  const idleHtml = end.innerHTML;
  const spinHtml =
    '<span style="display:inline-block;width:10px;height:10px;border:1.5px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:999px;corner-shape:round;animation:__dshRecordSpin .8s linear infinite"></span><span>正在回到工作台…</span>';
  const doneHtml =
    '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"></rect></svg><span>已结束</span>';
  let switching = false;
  let handedOff = false;
  const settle = () => {
    if (!switching) return;
    switching = false;
    handedOff = true;
    paint();
  };
  const paint = () => {
    const phase = state.phase;
    if (state.__ready !== true) {
      label.textContent = '正在准备录制…';
      dot.style.display = 'none';
      shot.disabled = true;
      end.disabled = true;
      shot.setAttribute('style', look(false));
      end.setAttribute('style', look(false, true, false));
      if (glow !== null && glow !== undefined) glow.style.display = 'none';
      return;
    }
    if (switching) {
      label.textContent =
        '已结束 · 请求 ' + String(state.calls.length) + ' · 正在回到工作台…';
      dot.style.display = 'none';
      end.innerHTML = spinHtml;
      end.disabled = true;
      end.setAttribute('style', look(false, true, false));
      shot.disabled = true;
      shot.setAttribute('style', look(false));
      if (glow !== null && glow !== undefined) glow.style.display = 'none';
      return;
    }
    end.innerHTML = handedOff ? doneHtml : idleHtml;
    label.textContent =
      (phase === 'recording' ? '录制中 · ' : phase === 'finished' ? '录制完成 · ' : '录制 · 已停 · ') +
      '请求 ' +
      String(state.calls.length) +
      ' · 截图 ' +
      String(typeof state.shots === 'number' ? state.shots : 0);
    dot.style.display = phase === 'recording' ? 'inline-block' : 'none';
    shot.disabled = phase !== 'recording';
    end.disabled = phase !== 'recording';
    if (glow !== null && glow !== undefined) glow.style.display = phase === 'recording' ? 'block' : 'none';
    shot.setAttribute('style', look(phase === 'recording'));
    end.setAttribute('style', look(phase === 'recording', true, false));
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
  shot.onclick = byMouse(shot, () => {
    if (state.phase !== 'recording') return;
    state.shots = (typeof state.shots === 'number' ? state.shots : 0) + 1;
    keep();
    paint();
    wake();
  });
  const watchSwitch = () => {
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') settle();
      });
    }
    setTimeout(settle, 15000);
  };
  end.onclick = byMouse(end, () => {
    if (state.phase !== 'recording') return;
    switching = true;
    state.phase = 'finished';
    state.t1 = Date.now();
    wake();
    keep();
    paint();
    watchSwitch();
  });
  if (typeof state.barX === 'number' && typeof state.barY === 'number') place(state.barX, state.barY);
  paint();
  return {
    ok: true,
    fresh: window[FRESH] === true,
    phase: state.phase,
    t0: state.t0 === undefined ? null : state.t0,
    t1: state.t1 === undefined ? null : state.t1,
    href: location.href,
    size: state.calls.length,
    shots: typeof state.shots === 'number' ? state.shots : 0,
    dropped: typeof state.dropped === 'number' ? state.dropped : 0,
  };
})()`;
