import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { planStep } from '../model/flow/plan-step';
import { createDiyFlowRuns } from '../model/flow/runs';

const runsOf = () => {
  const ended: string[] = [];
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    workspaceOf: () => '/w/a',
    onEnd: (session) => ended.push(session),
  });
  return { runs, ended };
};

describe('计划工具推进流程', () => {
  it('★★ 判成看板：递去向与计划，停在等她点头', async () => {
    const { runs } = runsOf();

    const result = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '每天看一次报销审批卡在哪',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
      cells: '3',
      minutes: '5',
    });

    expect(result.ok).toBe(true);
    expect(result.step).toBe('probe');
    expect(runs.stepOf('s-1')?.id).toBe('probe');
  });

  it('★★ 判成一次性：递完去向就收摊，不进面板', async () => {
    const { runs, ended } = runsOf();

    const result = await planStep(runs, 's-1', { destination: 'once', summary: '算一下这个月的数' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.done).toBe(true);
    expect(result.step).toBeNull();
    expect(result.ok).toBe(true);
    expect(runs.stepOf('s-1')).toBeNull();
    expect(ended).toEqual(['s-1']);
  });

  it('★ 计划能连续跑两次：先判去向，再补计划', async () => {
    const { runs } = runsOf();

    await planStep(runs, 's-1', { destination: 'board', summary: '盯库存低于 10 的', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    const second = await planStep(runs, 's-1', { destination: 'board', summary: '盯库存低于 10 的', cells: '2', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });

    expect(second.step).toBe('probe');
  });

  it('★ 范围变了重新计划：旧流程被停掉，新流程从判去向开始', async () => {
    const { runs } = runsOf();
    await planStep(runs, 's-1', { destination: 'board', summary: '第一版', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });

    const again = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '改成另一件事',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
    });

    expect(again.step).toBe('probe');
    expect(runs.stepOf('s-1')?.id).toBe('probe');
  });
});
