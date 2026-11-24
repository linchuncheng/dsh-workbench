import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
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
    expect((first as { shown: number }).shown).toBe(0);
    expect(second).toEqual(first);
  });
});

describe('诊断工具：带上启动检查快照', () => {
  function executeWith(root: string): Promise<Record<string, unknown>> {
    const registered: DshToolDefinition[] = [];
    const tools = {
      register: (tool: DshToolDefinition) => {
        registered.push(tool);
        return () => undefined;
      },
    } as unknown as DshToolRegistry;
    const ctx = { get: (name: string) => (name === 'tools' ? tools : undefined) } as unknown as DshHostContext;
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    registerDiagTools(ctx);
    return Promise.resolve(registered[0]?.execute({}, {} as never) as Promise<Record<string, unknown>>);
  }

  it('★ preflight.json 在 → 带回症状摘要（带证据文件路径），不把日志塞给 agent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-'));
    writeFileSync(
      join(root, 'preflight.json'),
      JSON.stringify({
        phase: 'ready',
        at: 1,
        steps: [
          { id: 'cli', status: 'ok', detail: '2.0.3', log: ['> opencli --version', '2.0.3'] },
          { id: 'diy', status: 'warn', detail: 'tool-schedule: never started', log: ['x', 'y'] },
        ],
        diyGap: { kind: 'broken-row', rows: ['tool-schedule'], detail: 'tool-schedule: never started' },
      }),
    );
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    const preflight = result['preflight'] as Record<string, unknown>;
    expect(preflight['phase']).toBe('ready');
    expect(preflight['diy']).toMatchObject({ kind: 'broken-row', rows: ['tool-schedule'] });
    expect(preflight['evidence']).toContain('preflight.json');
    expect(preflight['steps']).toEqual([
      { id: 'cli', status: 'ok', detail: '2.0.3' },
      { id: 'diy', status: 'warn', detail: 'tool-schedule: never started' },
    ]);
    expect(JSON.stringify(preflight)).not.toContain('opencli --version');
  });

  it('★ 快照坏了 → null（一个坏文件不该让诊断工具失败）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-bad-'));
    writeFileSync(join(root, 'preflight.json'), '{not json');
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['preflight']).toBeNull();
  });

  it('★ 还没有快照 → null（不抛、不冒充空对象）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-preflight-empty-'));
    const result = await executeWith(root);
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(result['preflight']).toBeNull();
  });
});
