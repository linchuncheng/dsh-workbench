import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import type { FlowDefinition } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW, DIY_FLOW_ACTIONS, DIY_TWEAK_FLOW } from '../definitions';

const FAKE_AGENTS = {
  open: async () => ({
    run: async () => ({ text: 'ok', childId: 'c1', name: 'judge', stopReason: 'stop' }),
    dispose: async () => {},
  }),
};

function hostWithActions() {
  const flowHost = createFlowHost({ agents: FAKE_AGENTS });
  const actions = flowHost.createActions();
  for (const name of Object.values(DIY_FLOW_ACTIONS)) {
    actions.register(name, async () => 'ok', { title: name });
  }
  return { flowHost, actions };
}

function agentStepsOf(flow: FlowDefinition) {
  return flow.steps.filter((step) => 'agent' in step);
}

describe('DIY 流程定义', () => {
  it('★★ 两条流程都能过引擎校验：动作名齐、引用指得到', () => {
    const { flowHost, actions } = hostWithActions();

    expect(flowHost.check(DIY_BOARD_FLOW, actions)).toEqual({ ok: true, problems: [] });
    expect(flowHost.check(DIY_TWEAK_FLOW, actions)).toEqual({ ok: true, problems: [] });
  });

  it('★ 少注册一个动作就过不了校验，错误里点名那一步', () => {
    const flowHost = createFlowHost({ agents: FAKE_AGENTS });
    const actions = flowHost.createActions();
    actions.register(DIY_FLOW_ACTIONS.awaitAnswer, async () => 'ok', {});

    const checked = flowHost.check(DIY_BOARD_FLOW, actions);

    expect(checked.ok).toBe(false);
    expect(checked.problems.map((one) => one.path)).toContain('steps[5].action');
  });

  it('★ 写工具只在「建模块」一步可见', () => {
    const board = agentStepsOf(DIY_BOARD_FLOW);
    const allowingWrite = board.filter((step) => (step.agent.tools?.allow ?? []).includes('write'));

    expect(allowingWrite.map((step) => step.id)).toEqual(['build']);
    for (const step of board.filter((one) => one.id !== 'build')) {
      expect(step.agent.tools?.deny ?? [], step.id).toContain('write');
    }
  });

  it('★ 判去向与计划都不给写工具，且确认排在计划之后、站探之前', () => {
    const ids = DIY_BOARD_FLOW.steps.map((step) => step.id);
    const judge = DIY_BOARD_FLOW.steps.find((step) => step.id === 'judge');
    const plan = DIY_BOARD_FLOW.steps.find((step) => step.id === 'plan');

    expect(judge !== undefined && 'agent' in judge ? judge.agent.tools?.deny : undefined).toContain('write');
    expect(plan !== undefined && 'agent' in plan ? plan.agent.tools?.deny : undefined).toContain('write');
    expect(ids.indexOf('confirm')).toBeGreaterThan(ids.indexOf('plan'));
    expect(ids.indexOf('confirm')).toBeLessThan(ids.indexOf('probe'));
  });

  it('★ 非看板去向不进后续步骤：计划到留账都挂在「是看板」这个条件上', () => {
    const gated = DIY_BOARD_FLOW.steps.filter((step) => step.when !== undefined).map((step) => step.id);

    expect(gated).toEqual(['plan', 'confirm', 'probe', 'build', 'install', 'verify', 'ledger']);
  });

  it('★ 改一格那条从建模块开始：没有站探这一步', () => {
    const ids = DIY_TWEAK_FLOW.steps.map((step) => step.id);

    expect(ids).toEqual(['plan', 'build', 'install', 'verify']);
    expect(ids).not.toContain('probe');
  });
});
