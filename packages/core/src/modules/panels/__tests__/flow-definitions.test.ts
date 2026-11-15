import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import type { FlowStepEvent } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW, DIY_BOARD_STEPS, DIY_TWEAK_FLOW } from '../model/flow/definitions';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function openBoard() {
  const events: FlowStepEvent[] = [];
  const session = createFlowHost().open({
    flow: DIY_BOARD_FLOW,
    input: {},
    workspace: '/w/a',
    onStep: (event) => events.push(event),
  });
  return { session, events };
}

describe('DIY 流程定义', () => {
  it('★★ 两条流程都能过外部推进的校验：节点没有执行体', () => {
    const host = createFlowHost();

    expect(host.check(DIY_BOARD_FLOW, { has: () => false }, { external: true })).toEqual({
      ok: true,
      problems: [],
    });
    expect(host.check(DIY_TWEAK_FLOW, { has: () => false }, { external: true })).toEqual({
      ok: true,
      problems: [],
    });
  });

  it('★ 有执行体的节点过不了外部推进的校验', () => {
    const host = createFlowHost();
    const withAction = {
      id: 'bad',
      title: '坏图',
      steps: [{ id: 'a', title: 'A', action: 'read' }],
    };

    const checked = host.check(withAction, { has: () => true }, { external: true });

    expect(checked.ok).toBe(false);
    expect(checked.problems.map((one) => one.path)).toContain('steps[0]');
  });

  it('★★ 看板去向：七步依次停住，递一步走一步', async () => {
    const { session, events } = openBoard();
    const seen: string[] = [];

    for (const stepId of DIY_BOARD_STEPS) {
      expect(session.current()?.stepId).toBe(stepId);
      seen.push(stepId);
      session.provide(stepId, stepId === 'judge' ? { destination: 'board' } : true);
      await tick();
    }

    const result = await session.result;

    expect(seen).toEqual(['judge', 'plan', 'confirm', 'probe', 'build', 'install', 'verify', 'ledger']);
    expect(result.status).toBe('ok');
    expect(events.filter((one) => one.status === 'skipped')).toEqual([]);
  });

  it('★ 非看板去向：判完就结束，后面全部跳过', async () => {
    const { session, events } = openBoard();

    session.provide('judge', { destination: 'once' });
    const result = await session.result;

    expect(result.status).toBe('ok');
    expect(result.steps).toEqual({ judge: { destination: 'once' } });
    expect(events.filter((one) => one.status === 'skipped').map((one) => one.stepId)).toEqual(
      DIY_BOARD_STEPS.slice(1),
    );
  });

  it('★ 写工具只在「建模块」与「留账」放行，其余步骤都写在定义里', () => {
    const writeSteps = new Set(['build', 'ledger']);

    for (const step of DIY_BOARD_FLOW.steps) {
      const allowsWrite = (step.tools?.allow ?? []).includes('write');
      const deniesWrite = (step.tools?.deny ?? []).includes('write');

      expect(allowsWrite, step.id).toBe(writeSteps.has(step.id));
      expect(deniesWrite, step.id).toBe(!writeSteps.has(step.id));
    }
  });

  it('★ 重试与入参约定也写在定义里，不在调用方', () => {
    const probe = DIY_BOARD_FLOW.steps.find((step) => step.id === 'probe');
    const judge = DIY_BOARD_FLOW.steps.find((step) => step.id === 'judge');

    expect(probe?.retry?.attempts).toBe(2);
    expect(judge?.schema?.['required']).toEqual(['destination', 'summary']);
  });

  it('★ 改一格从建模块起，没有站探', () => {
    const ids = DIY_TWEAK_FLOW.steps.map((step) => step.id);

    expect(ids).toEqual(['plan', 'build', 'install', 'verify']);
    expect(ids).not.toContain('probe');
  });
});
