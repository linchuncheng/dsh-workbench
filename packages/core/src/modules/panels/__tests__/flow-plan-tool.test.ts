import { describe, expect, it } from 'vitest';
import { createFlowHost } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW } from '../model/flow/definitions';
import { registerDiyPlanTool } from '../model/flow/plan-tool';
import { createDiyFlowRuns } from '../model/flow/runs';

function rig() {
  const registered: DshToolDefinition[] = [];
  const ctx = {
    get: (name: string) =>
      name === 'tools'
        ? {
            register: (tool: DshToolDefinition) => {
              registered.push(tool);
              return () => {};
            },
          }
        : undefined,
    logger: undefined,
  } as unknown as DshHostContext;
  const runs = createDiyFlowRuns({
    host: createFlowHost(),
    flow: DIY_BOARD_FLOW,
    workspaceOf: () => '/w/a',
    onEnd: () => {},
  });
  registerDiyPlanTool(ctx, runs);
  const exec = { agent: { session: { id: 's-1' } } } as unknown as DshToolRunContext;
  return { tool: registered[0], runs, exec };
}

describe('计划工具', () => {
  it('★★ 判成看板：递两步，回话说停在第几步', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    const out = (await tool.execute(
      { destination: 'board', summary: '盯库存低于 10 的', cells: '3' },
      exec,
    )) as { step: string; done: boolean; text: string };

    expect(out.step).toBe('confirm');
    expect(out.done).toBe(false);
    expect(out.text).toContain('confirm');
  });

  it('★ 判成一次性：当场收尾，不再往下走', async () => {
    const { tool, runs, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    const out = (await tool.execute({ destination: 'once', summary: '算这个月的数' }, exec)) as {
      step: string | null;
      done: boolean;
    };

    expect(out.done).toBe(true);
    expect(out.step).toBeNull();
    expect(runs.stepOf('s-1')).toBeNull();
  });

  it('★ 乱填去向当场拒，不静默', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(tool.execute({ destination: '看板', summary: 'x' }, exec)).rejects.toThrow(/去向只能是/);
  });

  it('★ 缺定义里要求的字段当场拒', async () => {
    const { tool, exec } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(tool.execute({ destination: 'board' }, exec)).rejects.toThrow(/summary/);
  });

  it('★ 没有会话 id 就拒，不假装推进了', async () => {
    const { tool } = rig();
    if (tool === undefined) throw new Error('没有注册上');

    await expect(
      tool.execute({ destination: 'board', summary: 'x' }, {} as unknown as DshToolRunContext),
    ).rejects.toThrow(/没有 id/);
  });
});
