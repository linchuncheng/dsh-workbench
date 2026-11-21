import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketUnreadableBadge } from '../market-unreadable-badge';

const t = ((key: string, options?: { readonly count?: string }) =>
  options?.count === undefined ? key : `${key}:${options.count}`) as never;

describe('读不出来徽标的渲染', () => {
  it('★ 有行时能渲染出来，不抛（防整页空白）', () => {
    const render = (): string =>
      renderToStaticMarkup(
        h(MarketUnreadableBadge, {
          t,
          rows: [
            { pkg: '@acme/a', reason: '找不到这个模块的文件' },
            { pkg: '', reason: '清单本身没读出来' },
          ],
        }),
      );

    expect(render).not.toThrow();
    expect(render()).toContain('_seat_');
  });

  it('没有行时什么都不渲染', () => {
    expect(renderToStaticMarkup(h(MarketUnreadableBadge, { t, rows: [] }))).toBe('');
  });
});
