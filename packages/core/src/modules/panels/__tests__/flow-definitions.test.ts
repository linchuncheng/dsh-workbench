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

    const values: Record<string, unknown> = {
      judge: { destination: 'board', summary: '盯库存' },
      plan: { cells: '3', ...{ see: ['一眼'], do: ['一点'], agent: ['一件'], data: ['一处'] } },
      probe: { sites: [] },
      build: { unit: 'stock' },
      install: { unit: 'stock', installed: true },
      verify: { passed: [], unverified: [] },
      ledger: { design: 'design.json' },
    };

    for (const stepId of DIY_BOARD_STEPS) {
      expect(session.current()?.stepId).toBe(stepId);
      seen.push(stepId);
      expect(session.provide(stepId, values[stepId])).toEqual({ ok: true });
      await tick();
    }

    const result = await session.result;

    expect(seen).toEqual(['judge', 'probe', 'plan', 'build', 'install', 'verify', 'ledger']);
    expect(result.status).toBe('ok');
    expect(events.filter((one) => one.status === 'skipped')).toEqual([]);
  });

  it('★ 没有看板的模块：跳过确认方案，照样创建、安装、检查、保存', async () => {
    const { session } = openBoard();
    const seen: string[] = [];

    expect(session.provide('judge', { destination: 'headless', summary: '加一个读库存的工具' })).toEqual({
      ok: true,
    });
    await tick();

    const values: Record<string, unknown> = {
      probe: { sites: [] },
      build: { unit: 'stock-tool' },
      install: { unit: 'stock-tool', installed: true },
      verify: { passed: [], unverified: [] },
      ledger: { design: 'design.json' },
    };
    for (const stepId of ['probe', 'build', 'install', 'verify', 'ledger']) {
      expect(session.current()?.stepId).toBe(stepId);
      seen.push(stepId);
      expect(session.provide(stepId, values[stepId])).toEqual({ ok: true });
      await tick();
    }

    const result = await session.result;

    expect(seen).toEqual(['probe', 'build', 'install', 'verify', 'ledger']);
    expect(result.status).toBe('ok');
    expect(result.steps['plan']).toBeUndefined();
  });

  it('★ 方案少写四段就递不上去，卡上不会是一张空壳', async () => {
    const { session } = openBoard();

    expect(session.provide('judge', { destination: 'board', summary: '盯库存' })).toEqual({ ok: true });
    await tick();
    expect(session.provide('probe', { sites: [] })).toEqual({ ok: true });
    await tick();

    const refused = session.provide('plan', { cells: '3' });

    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.problem).toContain('see');
  });

  it('★ 非看板去向：判完就结束，后面全部跳过', async () => {
    const { session, events } = openBoard();

    expect(session.provide('judge', { destination: 'once', summary: '算个数' })).toEqual({ ok: true });
    const result = await session.result;

    expect(result.status).toBe('ok');
    expect(result.steps).toEqual({ judge: { destination: 'once', summary: '算个数' } });
    expect(events.filter((one) => one.status === 'skipped').map((one) => one.stepId)).toEqual(
      DIY_BOARD_STEPS.slice(1),
    );
  });

  it('★ 写工具只在「建模块」与「留账」不拒，其余步骤都在定义里写明了拒', () => {
    const writeSteps = new Set(['build', 'ledger']);

    for (const step of DIY_BOARD_FLOW.steps) {
      const deniesWrite = (step.tools?.deny ?? []).includes('write');

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
