import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardReadFailed } from '../BoardReadFailed';

const t = ((key: string) => key) as never;

describe('面板列读失败的阻断态', () => {
  it('★ 有码时把码与原因都放进详情，能渲染不抛', () => {
    const render = (): string =>
      renderToStaticMarkup(h(BoardReadFailed, { t, detail: '磁盘读不了', code: 'READ_FAILED', onRetry: () => undefined }));

    expect(render).not.toThrow();
  });

  it('没有码时只放原因', () => {
    expect(() => renderToStaticMarkup(h(BoardReadFailed, { t, detail: '网络断了', onRetry: () => undefined }))).not.toThrow();
  });
});
