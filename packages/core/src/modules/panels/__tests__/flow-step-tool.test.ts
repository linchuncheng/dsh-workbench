import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import type { DshToolRunContext } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { createDiyFlowRuns } from '../model/flow/runs';
import { registerDiyStepTool } from '../model/flow/step-tool';

const exec = { agent: { session: { id: 's-1' } } } as unknown as DshToolRunContext;

function rig() {
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    workspaceOf: () => '/w/a',
    onEnd: () => {},
  });
  const registered: unknown[] = [];
  const ctx = {
    get: (key: string) => (key === 'tools' ? { register: (tool: unknown) => { registered.push(tool); return () => {}; } } : undefined),
  } as never;
  registerDiyStepTool(ctx, runs);
  return { runs, tool: registered[0] as { execute: (raw: unknown, exec: DshToolRunContext) => Promise<unknown> } };
}

describe('流程递交工具', () => {
  it('★★ 站探那步把站点递上去，流程走到确认方案', async () => {
    const { runs, tool } = rig();
    if (tool === undefined) throw new Error('没有注册上');
    runs.start('s-1');
    runs.provide('s-1', { destination: 'board', summary: '盯库存' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const out = (await tool.execute({ sites: ['库存表'] }, exec)) as { step: string; text: string };

    expect(out.step).toBe('plan');
    expect(out.text).toContain('确认方案');
    expect(runs.stepOf('s-1')?.id).toBe('plan');
  });

  it('★ 该递的字段没给就拒，并说清要递什么', async () => {
    const { runs, tool } = rig();
    runs.start('s-1');
    runs.provide('s-1', { destination: 'board', summary: '盯库存' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(tool.execute({}, exec)).rejects.toThrow(/sites/);
  });

  it('★ 她改主意了：带原因终止，流程立刻停下', async () => {
    const { runs, tool } = rig();
    runs.start('s-1');
    runs.provide('s-1', { destination: 'board', summary: '盯库存' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const out = (await tool.execute({ cancel: true, reason: '她说不做了' }, exec)) as { done: boolean; text: string };

    expect(out.done).toBe(true);
    expect(out.text).toContain('她说不做了');
    expect(runs.stepOf('s-1')).toBeNull();
  });

  it('★ 终止不给原因就拒', async () => {
    const { runs, tool } = rig();
    runs.start('s-1');

    await expect(tool.execute({ cancel: true }, exec)).rejects.toThrow(/原因/);
    expect(runs.stepOf('s-1')?.id).toBe('judge');
  });
});
