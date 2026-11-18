import { runInNewContext } from 'node:vm';
import { RECORD_READ_SCRIPT } from '../model/diy-record-read-scripts';

export const PAGE_URL = 'https://inventory.example.com/env';
const BAR_SIZE = { width: 300, height: 40 };
const PARKED = { left: 800, top: 600 };

export type FakeEvent = {
  target?: FakeEl;
  clientX?: number;
  clientY?: number;
  pointerId?: number;
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
};

const attrMatch = (node: FakeEl, part: string): boolean => {
  const box = part.match(/^\[([a-z-]+)(?:=\s*"?'?([^\]"']*)"?'?)?\]$/i);
  if (box === null) return false;
  const name = box[1] ?? '';
  const want = box[2];
  const got = node.getAttribute(name);
  return want === undefined ? got !== null : got === want;
};

const partMatch = (node: FakeEl, part: string): boolean => {
  if (part === '') return true;
  if (part.startsWith('[')) return attrMatch(node, part);
  if (part.startsWith('#')) return node.id === part.slice(1);
  if (part.startsWith('.')) return node.className.split(/\s+/).includes(part.slice(1));
  return String(node.tagName).toLowerCase() === part.toLowerCase();
};

const selectorMatch = (node: FakeEl, selector: string): boolean =>
  selector
    .split(',')
    .some((one) => one.trim().split(/(?=[.#[])/).every((piece) => partMatch(node, piece.trim())));

export class FakeEl {
  readonly attrs: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: FakeEl[] = [];
  parentElement: FakeEl | null = null;
  id = '';
  className = '';
  title = '';
  type = '';
  disabled = false;
  checked = false;
  value = '';
  innerHTML = '';
  removed = false;
  onclick: (() => void) | null = null;
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

  get name(): string {
    return this.attrs['name'] ?? '';
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  appendChild(kid: FakeEl): FakeEl {
    kid.parentElement = this;
    this.children.push(kid);
    return kid;
  }

  setPointerCapture(): void {}

  remove(): void {
    this.removed = true;
  }

  get outerHTML(): string {
    const attrs = Object.entries(this.attrs)
      .map(([name, value]) => ` ${name}="${value}"`)
      .join('');
    const own = `${String(this.tagName).toLowerCase()}${attrs}`;
    return `<${own}>${this.innerHTML}${this.children.map((kid) => kid.outerHTML).join('')}</${String(this.tagName).toLowerCase()}>`;
  }

  contains(node: FakeEl): boolean {
    return this.children.some((kid) => kid === node || kid.contains(node));
  }

  closest(selector: string): FakeEl | null {
    if (selectorMatch(this, selector)) return this;
    return this.parentElement === null ? null : this.parentElement.closest(selector);
  }

  querySelector(selector: string): FakeEl | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeEl[] {
    const hits: FakeEl[] = [];
    const walk = (node: FakeEl): void => {
      for (const kid of node.children) {
        if (selectorMatch(kid, selector)) hits.push(kid);
        walk(kid);
      }
    };
    walk(this);
    return hits;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    const left = this.style.left === undefined ? PARKED.left : Number.parseFloat(this.style.left);
    const top = this.style.top === undefined ? PARKED.top : Number.parseFloat(this.style.top);
    return { left, top, width: BAR_SIZE.width, height: BAR_SIZE.height };
  }
}

export class FakeXhr {
  status = 200;
  responseText = '';
  readonly opens: Array<{ method: string; url: string }> = [];
  private readonly listeners = new Map<string, Array<() => void>>();

  open(method?: string, url?: string): void {
    this.opens.push({ method: method ?? '', url: url ?? '' });
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
    for (const one of [...(this.listeners.get(name) ?? [])]) one();
  }
}

type FakeResponse = {
  url: string;
  status: number;
  headers: { get: (name: string) => string };
  clone: () => { text: () => Promise<string> };
};

const pageResponse = (url: string): FakeResponse => ({
  url,
  status: 200,
  headers: { get: () => 'application/json' },
  clone: () => ({ text: () => Promise.resolve('{"ok":true}') }),
});

export class FakeStorage {
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

  raw(key: string): Record<string, unknown> | null {
    const value = this.map.get(key);
    return value === undefined ? null : (JSON.parse(value) as Record<string, unknown>);
  }
}

type Listener = { name: string; handler: (event: FakeEvent) => void; capture: boolean };

export type Harness = {
  storage: FakeStorage;
  created: FakeEl[];
  listeners: Listener[];
  win: {
    innerWidth: number;
    innerHeight: number;
    listeners: string[];
    fetch: (input: unknown, init?: unknown) => Promise<FakeResponse>;
    addEventListener: (name: string) => void;
    removeEventListener: (name: string) => void;
  };
  doc: {
    head: FakeEl;
    body: FakeEl;
    title: string;
    querySelector: (selector: string) => FakeEl | null;
    querySelectorAll: (selector: string) => FakeEl[];
    documentElement: FakeEl;
    createElement: (tagName: string) => FakeEl;
    getElementById: (id: string) => FakeEl | null;
    addEventListener: (name: string, handler: (event: FakeEvent) => void, capture?: boolean) => void;
    removeEventListener: (name: string, handler: (event: FakeEvent) => void) => void;
  };
  navigator: { sendBeacon: ((url: unknown, data?: unknown) => boolean) | undefined };
  XMLHttpRequest: new () => FakeXhr;
  xhrs: FakeXhr[];
  fire: (name: string, target?: FakeEl) => void;
};

export const makeHarness = (options: { storage?: FakeStorage } = {}): Harness => {
  const created: FakeEl[] = [];
  const listeners: Listener[] = [];
  const storage = options.storage ?? new FakeStorage();
  const body = new FakeEl('body');
  const doc: Harness['doc'] = {
    head: new FakeEl('head'),
    body,
    title: '新建工单',
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    documentElement: new FakeEl('html'),
    createElement: (tagName) => {
      const element = new FakeEl(tagName);
      created.push(element);
      return element;
    },
    getElementById: (id) => created.find((element) => element.id === id && !element.removed) ?? null,
    addEventListener: (name, handler, capture) => {
      listeners.push({ name, handler, capture: capture === true });
    },
    removeEventListener: (name, handler) => {
      const at = listeners.findIndex((one) => one.name === name && one.handler === handler);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  const win: Harness['win'] = {
    innerWidth: 1200,
    innerHeight: 800,
    listeners: [],
    fetch: (input) => Promise.resolve(pageResponse(typeof input === 'string' ? input : PAGE_URL)),
    addEventListener: (name) => {
      win.listeners.push(name);
    },
    removeEventListener: (name) => {
      const at = win.listeners.lastIndexOf(name);
      if (at >= 0) win.listeners.splice(at, 1);
    },
  };
  const navigator: Harness['navigator'] = { sendBeacon: () => true };
  const xhrs: FakeXhr[] = [];
  const XMLHttpRequest = class extends FakeXhr {
    constructor() {
      super();
      xhrs.push(this);
    }
  };
  const fire = (name: string, target?: FakeEl): void => {
    for (const one of [...listeners]) {
      if (one.name === name) one.handler({ target, preventDefault: () => {} });
    }
  };
  return { storage, created, listeners, win, doc, navigator, XMLHttpRequest, xhrs, fire };
};

export const runScript = (script: string, harness: Harness): unknown =>
  runInNewContext(script, {
    window: harness.win,
    document: harness.doc,
    sessionStorage: harness.storage,
    location: { href: PAGE_URL },
    XMLHttpRequest: harness.XMLHttpRequest,
    navigator: harness.navigator,
    FormData: class FakeFormData {},
    Blob: class FakeBlob {},
    URLSearchParams: class FakeUrlSearchParams {},
    setTimeout: (handler: () => void, ms?: number): unknown => setTimeout(handler, ms),
    clearTimeout: (id?: unknown): void => {
      clearTimeout(id as ReturnType<typeof setTimeout>);
    },
  });

export const buttonOf = (harness: Harness, title: string): FakeEl => {
  const found = [...harness.created].reverse().find((element) => element.attrs['title'] === title);
  if (found === undefined) throw new Error(`浮条上没找到「${title}」那颗钮`);
  return found;
};

export const startOf = (harness: Harness): FakeEl => buttonOf(harness, '开始录制');

export const readPage = (harness: Harness): Promise<Record<string, unknown>> =>
  runScript(RECORD_READ_SCRIPT, harness) as Promise<Record<string, unknown>>;

export const flush = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
