import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared/host';
import { registerDiagTools } from '../diag-tool';

describe('诊断工具：常驻且只读', () => {
  it('★ 注册出 workbench_diag，执行两次结果一致（不写记录）', async () => {
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;

    registerDiagTools({} as DshHostContext, tools);

    expect(registered).toHaveLength(1);
    const tool = registered[0];
    expect(tool?.name).toBe('workbench_diag');
    const first = await tool?.execute({}, {} as never);
    const second = await tool?.execute({}, {} as never);
    expect(Array.isArray((first as { records: unknown[] }).records)).toBe(true);
    expect(second).toEqual(first);
  });
});
