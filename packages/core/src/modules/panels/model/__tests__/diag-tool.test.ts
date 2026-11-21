import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared/host';
import { diagHistoryOf, DIAG_HISTORY_LIMIT, registerDiagTools } from '../diag-tool';
import type { DiagReadResult, DiagRecord } from '@dsh-workbench/shared/host';

function recordOf(ts: number, code = 'MODULE_UNREADABLE', corrId = `c-${String(ts)}`): DiagRecord {
  return { ts, level: 'warn', code, class: 'user', area: 'market', corrId } as DiagRecord;
}

describe('诊断工具：常驻且只读', () => {
  it('★ 历史：落盘的记录补在内存之后，重复的不重复算，最多留最近 20 条', () => {
    const memory = [recordOf(3)];
    const disk: DiagReadResult = {
      records: [recordOf(1), recordOf(2), recordOf(3)],
      read: 30,
      skipped: 1,
    };

    const history = diagHistoryOf(memory, disk);

    expect(history?.records.map((one) => one.ts)).toEqual([1, 2]);
    expect(history?.read).toBe(30);
    expect(history?.skipped).toBe(1);
    const many: DiagReadResult = {
      records: Array.from({ length: DIAG_HISTORY_LIMIT + 5 }, (_, index) => recordOf(index + 10)),
      read: DIAG_HISTORY_LIMIT + 5,
      skipped: 0,
    };
    expect(diagHistoryOf([], many)?.records).toHaveLength(DIAG_HISTORY_LIMIT);
    expect(diagHistoryOf([], undefined)).toBeUndefined();
  });

  it('★ 注册出 workbench_diag，执行两次结果一致（不写记录）', async () => {
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = { get: (name: string) => (name === 'tools' ? tools : undefined) } as unknown as DshHostContext;

    registerDiagTools(ctx);

    expect(registered).toHaveLength(1);
    const tool = registered[0];
    expect(tool?.name).toBe('workbench_diag');
    const first = await tool?.execute({}, {} as never);
    const second = await tool?.execute({}, {} as never);
    expect(Array.isArray((first as { records: unknown[] }).records)).toBe(true);
    expect(second).toEqual(first);
  });
});
