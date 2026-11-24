import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => {
  class Component<P, S> {
    props: P;
    state: S;

    constructor(props: P, state: S) {
      this.props = props;
      this.state = state;
    }

    setState(patch: Partial<S> | ((current: S) => Partial<S>)): void {
      const next = typeof patch === 'function' ? (patch as (current: S) => Partial<S>)(this.state) : patch;
      this.state = { ...(this.state as object), ...(next as object) } as S;
    }
  }
  return {
    Component,
    createElement: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props: props ?? {}, children }),
  };
});

import { boundaryOf, entryPromptOf, EntryBoundary as Boundary } from '../EntryBoundary';

const CARD = { type: 'card' } as never;

const t = (key: string, params?: Record<string, unknown>): string =>
  params === undefined ? key : `${key}(${JSON.stringify(params)})`;

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

function boundary(failed = true, extra: Record<string, unknown> = {}): Boundary {
  const one = new Boundary({ label: 'rightbar', t, children: CARD, ...extra });
  one.state = failed
    ? { failed: true, reason: 'TypeError: boom\n  at openRightbar', copied: false }
    : { failed: false, reason: '', copied: false };
  return one;
}

function renderOf(one: Boundary): AnyElement | null {
  return one.render() as unknown as AnyElement | null;
}

describe('客户端入口失败：那一块自己说清楚，别人不受影响', () => {
  it('没出事时原样给 children', () => {
    expect(renderOf(boundary(false))).toEqual(CARD);
  });

  it('★ 出事时不再渲染 null：一句话 + 复制给 agent', () => {
    const tree = renderOf(boundary());
    const rendered = JSON.stringify(tree);

    expect(rendered).toContain('entry.failed');
    expect(rendered).toContain('askAgent.copy');
    expect(rendered).toContain('wb-link');
  });

  it('★ 复制成功后按钮变「已复制」，并出提示', () => {
    const one = boundary();
    (one as unknown as { copyPrompt(): void }).copyPrompt();

    return Promise.resolve().then(() => {
      expect(one.state.copied).toBe(true);
      const rendered = JSON.stringify(renderOf(one));
      expect(rendered).toContain('askAgent.copied');
      expect(rendered).toContain('askAgent.hint');
    });
  });

  it('复制只发生在点下去之后：复制完进入「已复制」态', async () => {
    const one = boundary();
    expect(one.state.copied).toBe(false);
    (one as unknown as { copyPrompt(): void }).copyPrompt();
    await Promise.resolve();
    await Promise.resolve();

    expect(one.state.copied).toBe(true);
  });

  it('拿不到 t 时退回老行为（null），不硬画半句文案', () => {
    const one = boundary(true, { t: undefined });
    expect(renderOf(one)).toBeNull();
  });

  it('★ 边界把 t 传给里面：boundaryOf 不再丢 props', () => {
    const element = boundaryOf('rightbar', (): null => null)({ t }) as unknown as AnyElement;
    expect(element.props['t']).toBe(t);
    expect(element.props['label']).toBe('rightbar');
  });
});

describe('入口失败的提示词内容', () => {
  it('位置写「工作台界面 · 槽位名」，现象是一句话，原因只取首行', () => {
    const prompt = entryPromptOf('sidebar.session.row.leading', 'bad\n  at x', t);

    expect(prompt).toContain('"screen":"askAgent.screen.workbench"');
    expect(prompt).toContain('"step":"sidebar.session.row.leading"');
    expect(prompt).toContain('"detail":"entry.failed"');
    expect(prompt).toContain('"reason":"bad"');
  });
});
