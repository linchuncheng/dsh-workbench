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
  it('★★ 判成看板：流程开在查看数据来源，方案先不收', async () => {
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
    expect(result.index).toBe(1);
    expect(result.total).toBe(6);
    expect(runs.stepOf('s-1')?.id).toBe('probe');
  });

  it('★★ 判成一次性：一条流程都不开', async () => {
    const { runs, ended } = runsOf();

    const result = await planStep(runs, 's-1', { destination: 'once', summary: '算一下这个月的数' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.done).toBe(true);
    expect(result.step).toBeNull();
    expect(result.ok).toBe(true);
    expect(runs.stepOf('s-1')).toBeNull();
    expect(ended).toEqual([]);
  });

  it('★ 先判去向停在站探；站探递完再调，才递方案', async () => {
    const { runs } = runsOf();
    const first = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '盯库存低于 10 的',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
    });

    expect(first.step).toBe('probe');
    expect(first.index).toBe(1);

    runs.provide('s-1', { sites: ['库存表'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = await planStep(runs, 's-1', {
      destination: 'board',
      summary: '盯库存低于 10 的',
      cells: '2',
      see: ['一眼'],
      do: ['一点'],
      agent: ['一件'],
      data: ['一处'],
    });

    expect(second.step).toBe('build');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★ 已经在后面几步了，再调计划工具就说清该用哪把工具', async () => {
    const { runs } = runsOf();
    await planStep(runs, 's-1', { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    runs.provide('s-1', { sites: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await planStep(runs, 's-1', { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const again = await planStep(runs, 's-1', { destination: 'board', summary: '盯库存', see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] });

    expect(again.ok).toBe(false);
    expect(again.text).toContain('workbench_diy_step');
    expect(runs.stepOf('s-1')?.id).toBe('build');
  });

  it('★ 范围变了重新计划：旧流程被停掉，新流程从查看数据来源开始', async () => {
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
