import { describe, expect, it } from 'vitest';
import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { diyFlowRoutes, flowSteps } from '../model/flow/routes';
import type { DiyFlowRuns } from '../model/flow/runs';

function runsWith(step: { id: string; title?: string } | null): DiyFlowRuns {
  return {
    stepOf: () => (step === null ? null : ({ ...step, title: step.title ?? step.id } as never)),
    valuesOf: () => ({ judge: { destination: 'board', summary: '盯库存' } }),
  } as unknown as DiyFlowRuns;
}

describe('面板顶部那条进度行读的接口', () => {
  it('★★ 七步按顺序给出，标题是面板上的说法', () => {
    expect(flowSteps().map((step) => step.id)).toEqual([
      'judge',
      'plan',
      'probe',
      'build',
      'install',
      'verify',
      'ledger',
    ]);
    expect(flowSteps()[1]?.title).toBe('确认方案');
  });

  it('★★ 没开始走就什么都不说（不画假进度）', () => {
    const payload = diyFlowRoutes(runsWith(null))[DIY_FLOW_ROUTE]?.(new URLSearchParams());

    expect(payload).toMatchObject({ ok: true, current: null });
  });

  it('★ 判成没有看板就不显示「确认方案」那一步', () => {
    const routes = diyFlowRoutes({
      stepOf: () => ({ id: 'probe', title: '查看数据来源' }),
      valuesOf: () => ({ judge: { destination: 'headless', summary: '加个工具' } }),
    } as never);
    const payload = routes['panels/diy-flow'](new URLSearchParams('session=s-1')) as {
      steps: { id: string }[];
    };

    expect(payload.steps.map((one) => one.id)).toEqual([
      'judge',
      'probe',
      'build',
      'install',
      'verify',
      'ledger',
    ]);
  });

  it('★ 走到哪一步就说哪一步', () => {
    const payload = diyFlowRoutes(runsWith({ id: 'build' }))[DIY_FLOW_ROUTE]?.(
      new URLSearchParams({ session: 's-1' }),
    );

    expect(payload).toMatchObject({ ok: true, current: { id: 'build', title: '创建模块' } });
  });
});
