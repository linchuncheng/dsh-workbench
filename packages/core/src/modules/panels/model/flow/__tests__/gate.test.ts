import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../definitions';
import { deniedAtStep } from '../gate';
import { createDiyFlowRuns } from '../runs';

const UNIVERSE = ['workbench_diy_status', 'workbench_diy_plan', 'write', 'edit', 'bash', 'workbench_modules_install'];

describe('这一步放行什么', () => {
  it('★★ 判去向没有写工具，建模块才有', () => {
    const judge = DIY_BOARD_FLOW.steps[0];
    const build = DIY_BOARD_FLOW.steps.find((step) => step.id === 'build');
    if (judge === undefined || build === undefined) throw new Error('定义缺步骤');

    const judgeDenied = deniedAtStep(judge, UNIVERSE);
    const buildDenied = deniedAtStep(build, UNIVERSE);

    expect([...judgeDenied]).toEqual(expect.arrayContaining(['write', 'edit', 'bash']));
    expect(judgeDenied.has('workbench_diy_plan')).toBe(false);
    expect([...buildDenied]).toEqual(['workbench_modules_install']);
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

    runs.provide('s-1', { destination: 'board' });
    await Promise.resolve();

    expect(runs.stepOf('s-1')?.id).toBe('plan');
    runs.provide('s-1', true);
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

    runs.provide('s-1', { destination: 'once' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ended).toEqual(['s-1']);
    expect(runs.stepOf('s-1')).toBeNull();
    expect(runs.provide('s-1', true)).toBe(false);
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
