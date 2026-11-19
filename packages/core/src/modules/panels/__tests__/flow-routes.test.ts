import { describe, expect, it } from 'vitest';
import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { diyFlowRoutes, flowSteps } from '../model/flow/routes';
import type { DiyFlowRuns } from '../model/flow/runs';

function runsWith(step: { id: string; title?: string } | null): DiyFlowRuns {
  return {
    stepOf: () => (step === null ? null : ({ ...step, title: step.title ?? step.id } as never)),
    valuesOf: () => ({}),
    inputOf: () => ({ destination: 'board', summary: '盯库存' }),
  } as unknown as DiyFlowRuns;
}

describe('面板顶部那条进度行读的接口', () => {
  it('★★ 六步按顺序给出，标题是面板上的说法', () => {
    expect(flowSteps().map((step) => step.id)).toEqual([
      'probe',
      'plan',
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

  it('★★ 没有看板也照样有「确认方案」，只是后两步换了说法', () => {
    const routes = diyFlowRoutes({
      stepOf: () => ({ id: 'probe', title: '查看数据来源' }),
      valuesOf: () => ({}),
      inputOf: () => ({ destination: 'headless', summary: '加个工具' }),
    } as never);
    const payload = routes['panels/diy-flow'](new URLSearchParams('session=s-1')) as {
      steps: { id: string; title: string }[];
    };

    expect(payload.steps.map((one) => one.id)).toEqual([
      'probe',
      'plan',
      'build',
      'install',
      'verify',
      'ledger',
    ]);
    expect(payload.steps.find((one) => one.id === 'install')?.title).toBe('安装模块');
    expect(payload.steps.find((one) => one.id === 'verify')?.title).toBe('检查模块功能');
  });

  it('★★ 判成改已有模块：五步，第一格是补方案', () => {
    const routes = diyFlowRoutes({
      stepOf: () => ({ id: 'plan', title: '补一下方案' }),
      valuesOf: () => ({}),
      inputOf: () => ({ destination: 'tweak', summary: '库存阈值改成 20' }),
    } as never);
    const payload = routes['panels/diy-flow'](new URLSearchParams('session=s-1')) as {
      steps: { id: string; title: string }[];
    };

    expect(payload.steps.map((one) => one.id)).toEqual(['plan', 'build', 'install', 'verify', 'ledger']);
    expect(payload.steps[0]?.title).toBe('补充方案');
  });

  it('★ 走到哪一步就说哪一步', () => {
    const payload = diyFlowRoutes(runsWith({ id: 'build' }))[DIY_FLOW_ROUTE]?.(
      new URLSearchParams({ session: 's-1' }),
    );

    expect(payload).toMatchObject({ ok: true, current: { id: 'build', title: '创建模块' } });
  });
});
