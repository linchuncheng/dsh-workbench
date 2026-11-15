import { describe, expect, it } from 'vitest';
import { panelsApprovalFor } from '../model/approval-policy';
import { DIY_PLAN_TOOL } from '../unit';

const call = (destination: string, extra: Record<string, unknown> = {}) => ({
  name: DIY_PLAN_TOOL,
  arguments: { destination, summary: '盯库存低于 10 的', cells: '3', steps: '3 步', ...extra },
  session: 's1',
});

describe('判成看板才问一句，其余去向不问', () => {
  it('★★ 看板：弹审批，标题就是一句人话加上她的原话', () => {
    const verdict = panelsApprovalFor()(call('board'));

    expect(verdict?.kind).toBe('ask');
    const question = verdict?.kind === 'ask' ? verdict.question.zh : '';
    expect(question).toBe('给你做一张看板：盯库存低于 10 的');
  });

  it('★★ 一次性：不问，直接走', () => {
    expect(panelsApprovalFor()(call('once'))).toEqual({ kind: 'allow' });
  });

  it('★ 用现成的 / 改道 / 没看板：都不问', () => {
    for (const destination of ['ready', 'reroute', 'headless']) {
      expect(panelsApprovalFor()(call(destination)), destination).toEqual({ kind: 'allow' });
    }
  });

  it('★ 没有复述就不问（问也没内容给她看）', () => {
    expect(panelsApprovalFor()(call('board', { summary: '' }))).toEqual({ kind: 'allow' });
  });
});
