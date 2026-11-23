import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketCheck } from '../market-check';

const t = ((key: string, options?: Record<string, string>) =>
  options === undefined ? key : `${key}:${Object.values(options).join(',')}`) as never;

const render = (props: {
  readonly checkedAt: number | null;
  readonly unknown?: number;
  readonly checking?: boolean;
  readonly failed?: boolean;
  readonly sourceFailed?: boolean;
}): string =>
  renderToStaticMarkup(
    h(MarketCheck, {
      t,
      checkedAt: props.checkedAt,
      latestCheck: { unknown: props.unknown ?? 0 },
      checking: props.checking ?? false,
      failed: props.failed ?? false,
      sourceFailed: props.sourceFailed ?? false,
      disabled: false,
      onCheck: () => undefined,
    }),
  );

describe('分区检查的状态小字', () => {
  it('★ 从没查过就直说，别让 ⟳ 旁边一片空白', () => {
    const markup = render({ checkedAt: null });

    expect(markup).toContain('panels.market.notCheckedYet');
    expect(markup).not.toContain('panels.market.checkedAt');
  });

  it('★ 一个最新版都没问到时（本机目录 / git 安装的模块），检查时间照样写出来', () => {
    const markup = render({ checkedAt: Date.now(), unknown: 0 });

    expect(markup).toContain('panels.market.checkedAt:panels.market.justNow');
    expect(markup).not.toContain('panels.market.latestPartial');
  });

  it('问不到新版本的那几个跟在时间后面', () => {
    const markup = render({ checkedAt: Date.now(), unknown: 2 });

    expect(markup).toContain('panels.market.checkedAt');
    expect(markup).toContain('panels.market.latestPartial:2');
  });

  it('★ 市场源没连上时说出来，不清空已经查到的结论', () => {
    const markup = render({ checkedAt: Date.now(), sourceFailed: true });

    expect(markup).toContain('panels.market.checkedAt');
    expect(markup).toContain('panels.market.sourceUnreachable');
  });

  it('市场源正常时不写那段', () => {
    expect(render({ checkedAt: Date.now() })).not.toContain('panels.market.sourceUnreachable');
  });

  it('正在检查时只写「正在检查…」', () => {
    expect(render({ checkedAt: Date.now(), checking: true })).toContain('panels.market.checkingNow');
  });

  it('★ 失败写在旧时间后面；一次都没成功过时只写失败，不写「还没检查更新」', () => {
    const before = render({ checkedAt: Date.now(), failed: true });
    expect(before).toContain('panels.market.checkedAt');
    expect(before).toContain('panels.market.checkFailed');

    const never = render({ checkedAt: null, failed: true });
    expect(never).toContain('panels.market.checkFailed');
    expect(never).not.toContain('panels.market.notCheckedYet');
  });
});