import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { RECORD_ARM_BAR_ITEMS_SCRIPT, RECORD_ARM_BAR_SCRIPT } from '../diy-record-bar-scripts';
import { RECORD_KEEP_KEY } from '../diy-record-keys';
import { RECORD_ARM_SCRIPT } from '../diy-record-scripts';
import { RECORD_STOP_SCRIPT } from '../diy-record-read-scripts';

const PAGE_URL = 'https://inventory.example.com/env';
const BAR_SIZE = { width: 220, height: 40 };
const PARKED = { left: 800, top: 600 };

type FakeEvent = {
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  key?: string;
  shiftKey?: boolean;
  detail?: number;
  preventDefault?: () => void;
};

class FakeEl {
  readonly attrs: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  id = '';
  className = '';
  title = '';
  type = '';
  disabled = false;
  innerHTML = '';
  removed = false;
  onclick: ((event?: FakeEvent) => void) | null = null;
  onpointerdown: ((event: FakeEvent) => void) | null = null;
  onpointermove: ((event: FakeEvent) => void) | null = null;
  onpointerup: (() => void) | null = null;
  onpointercancel: (() => void) | null = null;
  onkeydown: ((event: FakeEvent) => void) | null = null;
  private text = '';

  constructor(readonly tagName: string) {}

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    if (value === '') this.children.length = 0;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = value;
  }

  appendChild(kid: FakeEl): FakeEl {
    this.children.push(kid);
    return kid;
  }

  setPointerCapture(): void {}

  remove(): void {
    this.removed = true;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    const left = this.style.left === undefined ? PARKED.left : Number.parseFloat(this.style.left);
    const top = this.style.top === undefined ? PARKED.top : Number.parseFloat(this.style.top);
    return { left, top, width: BAR_SIZE.width, height: BAR_SIZE.height };
  }
}

type FakeResponse = {
  url: string;
  status: number;
  headers: { get: (name: string) => string };
  clone: () => { text: () => Promise<string> };
};

class FakeXhr {
  readonly listeners = new Map<string, Array<() => void>>();
  status = 200;
  responseText = '{"ok":true}';
  __dshMethod = '';
  __dshUrl = '';

  open(method: string, url: string): void {
    this.__dshMethod = method;
    this.__dshUrl = url;
  }

  send(_body?: unknown): void {}

  addEventListener(name: string, handler: () => void): void {
    const many = this.listeners.get(name) ?? [];
    many.push(handler);
    this.listeners.set(name, many);
  }

  removeEventListener(name: string, handler: () => void): void {
    const many = this.listeners.get(name) ?? [];
    this.listeners.set(name, many.filter((one) => one !== handler));
  }

  getResponseHeader(): string {
    return 'application/json';
  }

  fire(name: string): void {
    for (const handler of this.listeners.get(name) ?? []) handler();
  }
}

type FakeWindow = {
  innerWidth: number;
  innerHeight: number;
  listeners: string[];
  fetch: (input: unknown, init?: unknown) => Promise<FakeResponse>;
  addEventListener: (name: string) => void;
  removeEventListener: (name: string) => void;
  XMLHttpRequest: { prototype: object; new (): FakeXhr };
};

type FakeNavigator = { sendBeacon: ((url: unknown, data?: unknown) => boolean) | undefined };

class FakeFormData {}

class FakeBlob {
  constructor(readonly size: number) {}
}

class FakeUrlSearchParams {
  toString(): string {
    return 'a=1';
  }
}

type Kept = { phase?: string; calls?: unknown[]; barX?: number; barY?: number };

class FakeStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  raw(key: string): Kept | null {
    const value = this.map.get(key);
    return value === undefined ? null : (JSON.parse(value) as Kept);
  }
}

type Harness = {
  storage: FakeStorage;
  created: FakeEl[];
  doc: { head: FakeEl; documentElement: FakeEl; createElement: (tagName: string) => FakeEl; getElementById: (id: string) => FakeEl | null };
  win: FakeWindow;
  navigator: FakeNavigator;
};

const pageResponse = (url: string): FakeResponse => ({
  url,
  status: 200,
  headers: { get: () => 'application/json' },
  clone: () => ({ text: () => Promise.resolve('{"ok":true}') }),
});

const makeHarness = (options: { storage?: FakeStorage; fetcher?: FakeWindow['fetch'] } = {}): Harness => {
  const created: FakeEl[] = [];
  const listeners: string[] = [];
  const storage = options.storage ?? new FakeStorage();
  const doc: Harness['doc'] = {
    head: new FakeEl('head'),
    documentElement: new FakeEl('html'),
    createElement: (tagName) => {
      const element = new FakeEl(tagName);
      created.push(element);
      return element;
    },
    getElementById: (id) => created.find((element) => element.id === id && !element.removed) ?? null,
  };
  const win: FakeWindow = {
    innerWidth: 1200,
    innerHeight: 800,
    listeners,
    fetch: options.fetcher ?? ((input) => Promise.resolve(pageResponse(typeof input === 'string' ? input : PAGE_URL))),
    addEventListener: (name) => {
      listeners.push(name);
    },
    removeEventListener: (name) => {
      const at = listeners.lastIndexOf(name);
      if (at >= 0) listeners.splice(at, 1);
    },
    XMLHttpRequest: class extends FakeXhr {},
  };
  const navigator: FakeNavigator = { sendBeacon: () => true };
  return { storage, created, doc, win, navigator };
};

const runScript = (script: string, harness: Harness): unknown =>
  runInNewContext(script, {
    window: harness.win,
    document: harness.doc,
    sessionStorage: harness.storage,
    location: { href: PAGE_URL },
    XMLHttpRequest: harness.win.XMLHttpRequest,
    setTimeout: (run: () => void, ms?: number) => setTimeout(run, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as never),
    navigator: harness.navigator,
    FormData: FakeFormData,
    Blob: FakeBlob,
    URLSearchParams: FakeUrlSearchParams,
  });

const last = (created: FakeEl[], match: (element: FakeEl) => boolean): FakeEl => {
  const found = [...created].reverse().find(match);
  if (found === undefined) throw new Error('浮条上没找到这一件');
  return found;
};

const gripOf = (harness: Harness): FakeEl => last(harness.created, (element) => element.attrs['title'] === '拖动浮条');
const dotOf = (harness: Harness) => last(harness.created, (element) => element.className === '__dsh-record-dot');
const shotOf = (harness: Harness) => last(harness.created, (element) => element.attrs['title'] === '拍一张当前页面的截图');
const endOf = (harness: Harness) => last(harness.created, (element) => element.attrs['title'] === '结束录制');
const labelOf = (harness: Harness) => last(harness.created, (element) => element.textContent.includes('请求'));
const barOf = (harness: Harness) => {
  const bar = harness.doc.getElementById('__dsh-record-bar');
  if (bar === null) throw new Error('浮条没装上');
  return bar;
};

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('录制浮条：拖把 · 呼吸点 · 图标钮 · 条数实时更新（把脚本真跑一遍）', () => {
  it('★ 浮条上从左到右：拖把 | 状态点 | 文案 | 两颗钮（截图 / 方块+结束，完整那两句仍在无障碍名上）', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);

    const bar = barOf(harness);
    const grip = gripOf(harness);
    const dot = dotOf(harness);
    const label = labelOf(harness);
    const shot = shotOf(harness);
    const end = endOf(harness);

    expect(bar.children).toEqual([grip, dot, label, shot, end]);
    expect(bar.attrs['style']).toContain('position:fixed');

    expect(grip.attrs['role']).toBe('button');
    expect(grip.attrs['tabindex']).toBe('0');
    expect(grip.attrs['style']).toContain('cursor:grab');
    expect(grip.attrs['style']).toContain('touch-action:none');

    expect(dot.attrs['style']).toContain('background:#ef4444');
    expect(label.textContent).toBe('录制中 · 请求 0 · 截图 0');

    expect(end.attrs['aria-label']).toBe('结束录制');
    expect(shot.attrs['aria-label']).toBe('拍一张当前页面的截图');
    expect(shot.disabled).toBe(false);
    expect(end.attrs['title']).toBe('结束录制');
    expect(end.innerHTML).toContain('<rect');
    expect(end.children[0]?.textContent).toBe('结束');
    expect(shot.attrs['style']).toContain('padding:0 8px');
    expect(shot.attrs['style']).not.toContain('width:24px');
    expect(shot.attrs['style']).toContain('font-size:12px');
    expect(shot.attrs['style']).toContain('color:#fff');
    expect(shot.attrs['style']).toContain('#3b82f6');
    expect(end.attrs['style']).toContain('cursor:pointer');
    expect(end.attrs['style']).toContain('color:#fff');
  });

  it('★★ 录制页四周那圈淡蓝呼吸光：pointer-events 关掉（点得到页面），只在录制中亮，收工一起摘', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const glow = harness.doc.getElementById('__dsh-record-glow');

    expect(glow).not.toBeNull();
    expect(glow?.attrs['style']).toContain('pointer-events:none');
    expect(glow?.attrs['style']).toContain('position:fixed');
    expect(glow?.attrs['style']).toContain('box-shadow:inset');
    expect(glow?.attrs['style']).toContain('animation:__dshRecordGlow');

    const sheet = harness.doc.getElementById('__dsh-record-bar-style');
    expect(sheet?.textContent).toContain('@keyframes __dshRecordGlow');

    endOf(harness).onclick?.({ detail: 1 });
    expect(glow?.style.display).toBe('none');

    runScript(RECORD_STOP_SCRIPT, harness);
    expect(harness.doc.getElementById('__dsh-record-glow')).toBeNull();
  });

  it('★ 录制中每抓一条自己就涨：不用再按任何按钮', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const label = labelOf(harness);

    expect(label.textContent).toBe('录制中 · 请求 0 · 截图 0');

    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"env":"test"}' });
    await flush();
    expect(label.textContent).toBe('录制中 · 请求 1 · 截图 0');

    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"env":"test"}' });
    await flush();
    expect(label.textContent).toBe('录制中 · 请求 2 · 截图 0');

    expect(harness.storage.raw(RECORD_KEEP_KEY)?.phase).toBe('recording');
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.calls).toHaveLength(2);

    endOf(harness).onclick?.({ detail: 1 });
    endOf(harness).onclick?.({ detail: 1 });
    expect(label.textContent).toBe('已结束 · 请求 2 · 正在回到工作台…');
  });

  it('★★ 键盘敲出来的点击不算数：截图工具回车确认不会把录制结束掉', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const end = endOf(harness);

    end.onclick?.({ detail: 0 });
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.phase).toBe('recording');

    end.onclick?.({ detail: 1 });
    expect(harness.storage.raw(RECORD_KEEP_KEY)?.phase).toBe('finished');
  });

  it('★★ 装钮那一刻就带上样式：不用等接线那一拍，也不会露出浏览器默认钮', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_BAR_SCRIPT, harness);
    runScript(RECORD_ARM_BAR_ITEMS_SCRIPT, harness);

    for (const button of [shotOf(harness), endOf(harness)]) {
      expect(button.attrs['style']).toContain('border:0');
      expect(button.attrs['style']).toContain('padding:0 8px');
      expect(button.attrs['style']).toContain('background:#2b3444');
    }
    expect(endOf(harness).children[0]?.textContent).toBe('结束');
  });

  it('★★ 开页那一拍画的浮条顺带报地址：开窗核对全指着它，缺了就被当成空白页', () => {
    const harness = makeHarness();
    const out = runScript(RECORD_ARM_BAR_SCRIPT, harness) as { ok?: unknown; href?: unknown };

    expect(out?.ok).toBe(true);
    expect(out?.href).toBe(PAGE_URL);
  });

  it('★★ 「结束」是红的（#ef4444），开始/截图仍走蓝；它写着「结束」，不是「确认结束」', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const end = endOf(harness);

    expect(shotOf(harness).attrs['style']).toContain('background:#3b82f6');
    expect(end.attrs['style']).toContain('background:#ef4444');
    expect(end.children[0]?.textContent).toBe('结束');
  });

  it('★★ 结束一下就结束（不再二次确认）：一次点击就把相位推到 finished 并叫醒宿主', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const end = endOf(harness);

    end.onclick?.({ detail: 1 });

    expect(harness.storage.raw(RECORD_KEEP_KEY)?.phase).toBe('finished');
    expect(labelOf(harness).textContent).toBe('已结束 · 请求 0 · 正在回到工作台…');
    expect(end.disabled).toBe(true);
  });

  it('★ 两个按钮都不进 Tab 顺序：焦点永远落不到「结束」上', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);

    expect(shotOf(harness).attrs['tabindex']).toBe('-1');
    expect(endOf(harness).attrs['tabindex']).toBe('-1');
  });

  it('★★ 他自己按「截图」才记一张：计数 +1、落进 sessionStorage、不用等任何人', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const shot = shotOf(harness);
    expect(shot.disabled).toBe(false);

    const kept = (): unknown => (harness.storage.raw(RECORD_KEEP_KEY) as Record<string, unknown> | undefined)?.['shots'];
    shot.onclick?.();
    expect(kept()).toBe(1);
    shot.onclick?.();
    expect(kept()).toBe(2);
    expect(labelOf(harness).textContent).toBe('录制中 · 请求 0 · 截图 2');
  });

  it('★ 红色呼吸点只在录制中亮；关键帧住在注入的样式里；收工连样式一起摘', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const dot = dotOf(harness);
    const sheet = harness.doc.getElementById('__dsh-record-bar-style');

    expect(sheet?.textContent).toContain('@keyframes __dshRecordBreath');
    expect(sheet?.textContent).toContain('infinite');
    expect(dot.style.display).toBe('inline-block');

    endOf(harness).onclick?.({ detail: 1 });
    expect(dot.style.display).toBe('none');

    runScript(RECORD_STOP_SCRIPT, harness);
    expect(harness.doc.getElementById('__dsh-record-bar')).toBeNull();
    expect(harness.doc.getElementById('__dsh-record-bar-style')).toBeNull();
  });

  it('★ 拖到哪就停在哪（出屏夹回来），位置活过导航后的重注入', () => {
    const storage = new FakeStorage();
    const first = makeHarness({ storage });
    runScript(RECORD_ARM_SCRIPT, first);
    const bar = barOf(first);
    const grip = gripOf(first);

    grip.onpointerdown?.({ clientX: 900, clientY: 700, pointerId: 1, preventDefault: () => {} });
    expect(grip.style.cursor).toBe('grabbing');
    grip.onpointermove?.({ clientX: 600, clientY: 500, pointerId: 1 });
    expect(bar.style.left).toBe('500px');
    expect(bar.style.top).toBe('400px');
    expect(bar.style.right).toBe('auto');
    expect(bar.style.bottom).toBe('auto');

    grip.onpointermove?.({ clientX: 5000, clientY: 5000, pointerId: 1 });
    expect(bar.style.left).toBe('980px');
    expect(bar.style.top).toBe('760px');

    grip.onpointerup?.();
    expect(grip.style.cursor).toBe('grab');
    expect(storage.raw(RECORD_KEEP_KEY)?.barX).toBe(980);
    expect(storage.raw(RECORD_KEEP_KEY)?.barY).toBe(760);

    const again = makeHarness({ storage });
    runScript(RECORD_ARM_SCRIPT, again);
    expect(barOf(again).style.left).toBe('980px');
    expect(barOf(again).style.top).toBe('760px');
  });

  it('★ 钩子的漏点补上：XHR 走 loadend（失败/中止也算一条）、失败的 fetch 也算、beacon 也算', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const label = labelOf(harness);

    const caught = new harness.win.XMLHttpRequest();
    caught.open('POST', `${PAGE_URL}/api/publish`);
    caught.send('{"env":"test"}');
    caught.fire('loadend');
    expect(label.textContent).toBe('录制中 · 请求 1 · 截图 0');

    const aborted = new harness.win.XMLHttpRequest();
    aborted.status = 0;
    aborted.responseText = '';
    aborted.open('POST', `${PAGE_URL}/api/publish-again`);
    aborted.send('');
    aborted.fire('loadend');
    expect(label.textContent).toBe('录制中 · 请求 2 · 截图 0');

    const failing = makeHarness({ fetcher: () => Promise.reject(new Error('net down')) });
    runScript(RECORD_ARM_SCRIPT, failing);
    await failing.win.fetch('/api/publish', { method: 'POST', body: '{"env":"test"}' }).catch(() => undefined);
    await flush();
    expect(labelOf(failing).textContent).toBe('录制中 · 请求 1 · 截图 0');
    const rows = failing.storage.raw(RECORD_KEEP_KEY)?.calls as Array<Record<string, unknown>>;
    expect(rows[0]?.['status']).toBe(0);
    expect(rows[0]?.['ct']).toBe('fetch-error');

    harness.navigator.sendBeacon?.(`${PAGE_URL}/api/track`, '{"a":1}');
    expect(label.textContent).toBe('录制中 · 请求 3 · 截图 0');

    runScript(RECORD_STOP_SCRIPT, harness);
    expect(harness.navigator.sendBeacon).toBeDefined();
    expect(harness.win.listeners.filter((name) => name === 'resize')).toHaveLength(0);
  });

  it('★ 非字符串 body 别记成 "{}"：FormData / Blob / URLSearchParams 各有各的写法', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);

    await harness.win.fetch('/api/form', { method: 'POST', body: new FakeFormData() });
    await harness.win.fetch('/api/blob', { method: 'POST', body: new FakeBlob(7) });
    await harness.win.fetch('/api/query', { method: 'POST', body: new FakeUrlSearchParams() });
    await flush();

    const rows = harness.storage.raw(RECORD_KEEP_KEY)?.calls as Array<Record<string, unknown>>;
    expect(rows.map((one) => one['body'])).toEqual(['[form-data]', '[blob 7]', 'a=1']);
  });

  it('★★ 同一个 XHR 对象复用两轮：send 两次就记两条，不许叠成三条', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const label = labelOf(harness);

    const pooled = new harness.win.XMLHttpRequest();
    pooled.open('POST', `${PAGE_URL}/api/first`);
    pooled.send('{"n":1}');
    pooled.fire('loadend');
    pooled.open('POST', `${PAGE_URL}/api/second`);
    pooled.send('{"n":2}');
    pooled.fire('loadend');

    expect(label.textContent).toBe('录制中 · 请求 2 · 截图 0');
    const rows = harness.storage.raw(RECORD_KEEP_KEY)?.calls as Array<Record<string, unknown>>;
    expect(rows.map((one) => one['url'])).toEqual([`${PAGE_URL}/api/first`, `${PAGE_URL}/api/second`]);
  });

  it('★★ 重注入不重建浮条：同一条 label 继续跟着涨（不闪、不换节点）', async () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    const firstLabel = labelOf(harness);

    runScript(RECORD_ARM_SCRIPT, harness);
    const bar = barOf(harness);
    const visible = labelOf(harness);
    expect(visible).toBe(firstLabel);
    expect(bar.children).toContain(visible);

    await harness.win.fetch('/api/publish', { method: 'POST', body: '{"env":"test"}' });
    await flush();

    expect(visible.textContent).toBe('录制中 · 请求 1 · 截图 0');
    expect(bar.children).toContain(visible);
  });

  it('★ 等 agent 读的时候反复重注入：不叠监听、位置不丢；拖把也能用键盘挪', () => {
    const harness = makeHarness();
    runScript(RECORD_ARM_SCRIPT, harness);
    runScript(RECORD_ARM_SCRIPT, harness);
    runScript(RECORD_ARM_SCRIPT, harness);

    expect(harness.win.listeners.filter((name) => name === 'resize')).toHaveLength(1);

    const bar = barOf(harness);
    const grip = gripOf(harness);
    expect(bar.children).toEqual([grip, dotOf(harness), labelOf(harness), shotOf(harness), endOf(harness)]);

    grip.onkeydown?.({ key: 'ArrowRight', shiftKey: false, preventDefault: () => {} });
    expect(bar.style.left).toBe('816px');
    grip.onkeydown?.({ key: 'ArrowLeft', shiftKey: true, preventDefault: () => {} });
    expect(bar.style.left).toBe('776px');
    grip.onkeydown?.({ key: 'Enter', preventDefault: () => {} });
    expect(bar.style.left).toBe('776px');

    runScript(RECORD_STOP_SCRIPT, harness);
    expect(harness.win.listeners.filter((name) => name === 'resize')).toHaveLength(0);
  });
});
