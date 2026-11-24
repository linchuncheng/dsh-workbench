import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/react.js', () => {
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
    h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
    Component,
  };
});

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  CodeBlock: (props: unknown) => ({ type: 'CodeBlock', props }),
  DisclosureRow: (props: unknown, ...children: unknown[]) => ({ type: 'DisclosureRow', props, children }),
  IconInfoOutlineRegular: (props: unknown) => ({ type: 'icon', props }),
  writeClipboard: vi.fn(async () => true),
}));

import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { CardBoundary, cardBrokenPromptOf, type CardBoundaryProps } from '../CardBoundary.js';

const t = (key: string, params?: Record<string, unknown>): string =>
  params === undefined ? key : `${key}(${JSON.stringify(params)})`;

const CARD = { type: 'card' };

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: unknown[];
}

function boundary(extra: Partial<CardBoundaryProps> = {}): CardBoundary {
  const one = new CardBoundary({ unit: 'ai-chat', resetKey: 'w1', t, children: CARD as never, ...extra });
  one.state = { reason: 'TypeError: boom\n  at PanelBody (client.js:88:12)', detailsOpen: false, copied: false };
  return one;
}

function renderOf(one: CardBoundary): AnyElement {
  return one.render() as unknown as AnyElement;
}

function bodyOf(one: CardBoundary): AnyElement {
  return renderOf(one).children[0] as AnyElement;
}

function actionsOf(one: CardBoundary): readonly { key: string; label: unknown; kind?: string }[] {
  const actions = bodyOf(one).children.find(
    (child) => (child as AnyElement).props?.['actions'] !== undefined,
  ) as AnyElement;
  return actions.props['actions'] as readonly { key: string; label: unknown; kind?: string }[];
}

describe('卡片渲染崩溃：事实 + 折叠原文 + 两个出口', () => {
  it('正常渲染时原样给 children', () => {
    const one = new CardBoundary({ unit: 'ai-chat', resetKey: 'w1', t, children: CARD as never });
    expect(renderOf(one)).toEqual({ type: 'card' });
  });

  it('★ 标题只留事实：报错原文不进标题句', () => {
    const title = bodyOf(boundary()).children[0] as AnyElement;

    expect(title.children[0]).toContain('panels.cardBroken');
    expect(title.children[0]).toContain('ai-chat');
    expect(String(title.children[0])).not.toContain('TypeError: boom');
  });

  it('★ 原文收进折叠行（可复制），不在明面上铺开', () => {
    const fold = bodyOf(boundary()).children.find(
      (child) => (child as AnyElement).props?.['title'] === 'env.fix.details',
    ) as AnyElement;

    expect(fold).toBeDefined();
    const code = (fold.children[0] as AnyElement).props['code'];
    expect(code).toContain('TypeError: boom');
  });

  it('★ 两颗按钮：重试（次）+ 复制给 agent（主）', () => {
    const actions = actionsOf(boundary());

    expect(actions.map((action) => action.key)).toEqual(['retry', 'ask-agent']);
    expect(actions[0]?.label).toBe('panels.cardRetry');
    expect(actions[1]?.label).toBe('askAgent.copy');
    expect(actions[1]?.kind).toBe('primary');
  });

  it('复制成功后出提示；按钮态由外层按 copied 渲染', () => {
    const rendered = JSON.stringify(renderOf(boundary()));
    expect(rendered).not.toContain('askAgent.hint');

    const one = boundary();
    one.setState({ copied: true });
    expect(JSON.stringify(renderOf(one))).toContain('askAgent.hint');
  });

  it('★ 复制走的是提示词构造器：位置 + 哪个模块 + 报错首行', async () => {
    const one = boundary();
    (one as unknown as { copyPrompt(): void }).copyPrompt();
    await Promise.resolve();

    const clipboard = vi.mocked(writeClipboard);
    const prompt = clipboard.mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('askAgent.prompt.whereOnly');
    expect(prompt).toContain('panels.cardBroken');
    expect(prompt).not.toContain('client.js:88');
    expect(one.state.copied).toBe(true);
  });
});

describe('提示词内容', () => {
  it('位置写屏幕名、现象带模块 id、原因只取首行', () => {
    const prompt = cardBrokenPromptOf('ai-chat', 'TypeError: boom\n  at PanelBody (client.js:88:12)', t);

    expect(prompt).toContain('askAgent.prompt.whereOnly');
    expect(prompt).toContain('"screen":"askAgent.screen.board"');
    expect(prompt).toContain('panels.cardBroken');
    expect(prompt).toContain('"reason":"TypeError: boom"');
    expect(prompt).not.toContain('client.js:88');
  });

  it('空原因不硬写一行', () => {
    const prompt = cardBrokenPromptOf('ai-chat', '', t);
    expect(prompt).not.toContain('askAgent.prompt.reason');
  });
});
