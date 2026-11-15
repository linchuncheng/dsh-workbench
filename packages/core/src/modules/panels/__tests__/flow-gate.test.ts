import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { deniedAtStep } from '../model/flow/gate';
import { createDiyFlowRuns } from '../model/flow/runs';

describe('这一步拒什么', () => {
  it('★★ 判去向拒写，建模块不拒任何工具', () => {
    const judge = DIY_BOARD_FLOW.steps[0];
    const build = DIY_BOARD_FLOW.steps.find((step) => step.id === 'build');
    if (judge === undefined || build === undefined) throw new Error('定义缺步骤');

    const judgeDenied = deniedAtStep(judge);
    const buildDenied = deniedAtStep(build);

    expect([...judgeDenied]).toEqual(['write', 'edit', 'bash']);
    expect(judgeDenied.has('workbench_diy_recon')).toBe(false);
    expect([...buildDenied]).toEqual([]);
  });
});

describe('按会话跑的流程', () => {
  const runsOf = () =>
    createDiyFlowRuns({
      host: createFlowHost(),
      flow: DIY_BOARD_FLOW,
      workspaceOf: () => '/w/a',
      onEnd: () => {},
    });

  it('★★ 没开始时没有流程，开始时停在判去向', () => {
    const runs = runsOf();

    expect(runs.stepOf('s-1')).toBeNull();
    expect(runs.start('s-1').id).toBe('judge');
    expect(runs.stepOf('s-1')?.id).toBe('judge');
    expect(runs.stepOf('s-2')).toBeNull();
  });

  it('★★ 每递一次结果就前进一步，闸跟着换', async () => {
    const runs = runsOf();
    runs.start('s-1');

    expect(runs.provide('s-1', { destination: 'board', summary: '盯库存' })).toEqual({ ok: true });
    await Promise.resolve();

    expect(runs.stepOf('s-1')?.id).toBe('plan');
    runs.provide('s-1', { cells: '3' });
    await Promise.resolve();
    expect(runs.stepOf('s-1')?.id).toBe('confirm');
  });

  it('★ 非看板去向走完就收摊，闸重新放开', async () => {
    const ended: string[] = [];
    const runs = createDiyFlowRuns({
      host: createFlowHost(),
      flow: DIY_BOARD_FLOW,
      workspaceOf: () => '/w/a',
      onEnd: (session) => ended.push(session),
    });
    runs.start('s-1');

    runs.provide('s-1', { destination: 'once', summary: '算个数' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ended).toEqual(['s-1']);
    expect(runs.stepOf('s-1')).toBeNull();
    expect(runs.provide('s-1', true).ok).toBe(false);
  });

  it('★ 停掉之后不再有流程，重复开始会重新起一条', async () => {
    const runs = runsOf();
    runs.start('s-1');

    runs.stop('s-1');
    await Promise.resolve();

    expect(runs.stepOf('s-1')).toBeNull();
    expect(runs.start('s-1').id).toBe('judge');
  });
});
