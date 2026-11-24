import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import {
  PREFLIGHT_SNAPSHOT_LOG_LIMIT,
  persistPreflightSnapshot,
  preflightSnapshotPath,
} from '../preflight-snapshot.js';

const ROOT = mkdtempSync(join(tmpdir(), 'wb-preflight-snapshot-'));
afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function snapshotOf(extra: Partial<PreflightSnapshot> = {}): PreflightSnapshot {
  return { phase: 'ready', steps: [], at: 1, ...extra };
}

function savedOf(name: string, snapshot: PreflightSnapshot): Record<string, unknown> {
  const root = join(ROOT, name);
  persistPreflightSnapshot(root, snapshot);
  return JSON.parse(readFileSync(preflightSnapshotPath(root), 'utf8')) as Record<string, unknown>;
}

describe('启动检查快照落盘：agent 与维护者要读的证据', () => {
  it('★ 缺口、运行时事实、命令与日志都写进去（诊断只读这个文件就够定位）', () => {
    const saved = savedOf(
      'full',
      snapshotOf({
        steps: [
          { id: 'cli', status: 'ok', detail: '2.0.3', log: ["> 'opencli' --version", '2.0.3'] },
          { id: 'diy', status: 'warn', detail: 'never started', command: 'npm i -g @deepseek-ai/dsh@latest' },
        ],
        bridgeIssues: ['extension'],
        hostGap: {
          tier: 'older',
          runtime: '0.2.2-rc.5',
          verified: '0.2.3-alpha.2',
          command: 'npm i -g @deepseek-ai/dsh@latest',
          facts: { profileDir: '/tmp/wb' },
        },
        hostFacts: { version: '0.2.2-rc.5', from: 'DSH_VERSION', profileDir: '/tmp/wb' },
        diyGap: { kind: 'broken-row', rows: ['tool-schedule'], detail: 'never started' },
        guidance: 'install',
        failure: 'missing',
        error: '没有 opencli',
      }),
    );

    expect(saved['phase']).toBe('ready');
    expect(saved['bridgeIssues']).toEqual(['extension']);
    expect(saved['hostGap']).toMatchObject({ tier: 'older', runtime: '0.2.2-rc.5' });
    expect(saved['hostFacts']).toEqual({ version: '0.2.2-rc.5', from: 'DSH_VERSION', profileDir: '/tmp/wb' });
    expect(saved['diyGap']).toEqual({ kind: 'broken-row', rows: ['tool-schedule'], detail: 'never started' });
    expect(saved['guidance']).toBe('install');
    expect(saved['failure']).toBe('missing');
    expect(saved['error']).toBe('没有 opencli');
    const steps = saved['steps'] as readonly Record<string, unknown>[];
    expect(steps[0]).toMatchObject({ id: 'cli', status: 'ok', detail: '2.0.3' });
    expect(steps[0]?.['log']).toEqual(["> 'opencli' --version", '2.0.3']);
    expect(steps[1]).toMatchObject({ id: 'diy', command: 'npm i -g @deepseek-ai/dsh@latest' });
  });

  it('★ 步骤日志只留最后一段：文件不会无限长', () => {
    const log = Array.from({ length: PREFLIGHT_SNAPSHOT_LOG_LIMIT + 10 }, (_, index) => `line-${String(index + 1)}`);
    const saved = savedOf('tail', snapshotOf({ steps: [{ id: 'cli', status: 'ok', log }] }));
    const steps = saved['steps'] as readonly Record<string, unknown>[];

    expect(steps[0]?.['log']).toHaveLength(PREFLIGHT_SNAPSHOT_LOG_LIMIT);
    expect((steps[0]?.['log'] as readonly string[]).at(-1)).toBe(`line-${String(PREFLIGHT_SNAPSHOT_LOG_LIMIT + 10)}`);
    expect((steps[0]?.['log'] as readonly string[])[0]).toBe('line-11');
  });

  it('都就绪时不写缺口字段：读的人不用区分「没有」和「空」', () => {
    const saved = savedOf(
      'ready',
      snapshotOf({ steps: [{ id: 'cli', status: 'ok', detail: '2.0.3' }] }),
    );

    expect(saved).not.toHaveProperty('diyGap');
    expect(saved).not.toHaveProperty('hostGap');
    expect(saved).not.toHaveProperty('hostFacts');
    expect(saved).not.toHaveProperty('bridgeIssues');
    expect(saved).not.toHaveProperty('failure');
  });
});
