import { describe, expect, it } from 'vitest';
import { panelsApprovalFor } from '../model/approval-policy';
import { DIY_PLAN_TOOL } from '../unit';

const BODY = {
  see: ['哪几样低于 10 件'],
  do: ['点一下看明细'],
  agent: ['每天九点对一次账'],
  data: ['公司库存表，只读'],
};

const call = (destination: string, extra: Record<string, unknown> = {}) => ({
  name: DIY_PLAN_TOOL,
  arguments: { destination, summary: '盯库存低于 10 的', cells: '3', steps: '3 步', ...BODY, ...extra },
  session: 's1',
});

describe('判成看板才问一句，其余去向不问', () => {
  it('★★ 看板：标题说清这是模块设计方案，加上她的原话', () => {
    const verdict = panelsApprovalFor()(call('board'));

    expect(verdict?.kind).toBe('ask');
    const question = verdict?.kind === 'ask' ? verdict.question.zh : '';
    expect(question).toBe('模块设计方案');
  });

  it('★★ 一次性：不问，直接走', () => {
    expect(panelsApprovalFor()(call('once'))).toEqual({ kind: 'allow' });
  });

  it('★ 用现成的 / 改道：都不问', () => {
    for (const destination of ['ready', 'reroute']) {
      expect(panelsApprovalFor()(call(destination)), destination).toEqual({ kind: 'allow' });
    }
  });

  it('★★ 没有看板的模块也要点头：只是卡上没有字符画', () => {
    const verdict = panelsApprovalFor()(call('headless'));
    const question = verdict?.kind === 'ask' ? verdict.question.zh : '';

    expect(verdict?.kind).toBe('ask');
    expect(question).toBe('模块设计方案');
  });

  it('★ 没有复述就不问（问也没内容给她看）', () => {
    expect(panelsApprovalFor()(call('board', { summary: '' }))).toEqual({ kind: 'allow' });
  });

  it('★★ 只定去向的那一次不弹（卡上还是空的），带上方案的那一次才弹', () => {
    const bare = { name: DIY_PLAN_TOOL, arguments: { destination: 'board', summary: '盯库存' }, session: 's1' };

    expect(panelsApprovalFor()(bare)).toEqual({ kind: 'allow' });
    expect(panelsApprovalFor()(call('board'))?.kind).toBe('ask');
  });

  it('★ 字符画也算方案在场', () => {
    const verdict = panelsApprovalFor()(
      call('board', { see: [], do: [], shots: [{ caption: '卡片', ascii: '┌──┐' }] }),
    );

    expect(verdict?.kind).toBe('ask');
  });
});
