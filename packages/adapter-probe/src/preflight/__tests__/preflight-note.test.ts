import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '@dsh-workbench/shared/host';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { notePreflightFailed, notePreflightHold } from '../preflight-note.js';

function snapshotOf(extra: Partial<PreflightSnapshot>): PreflightSnapshot {
  return { phase: 'ready', steps: [], at: 1, ...extra };
}

describe('启动检查失败：落一条诊断记录', () => {
  it('★ 记 READ_FAILED（环境类），带原因，同一种失败只记一次', () => {
    let at = 1_000;
    const diag = createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });

    notePreflightFailed(diag, 'missing', '没有 opencli');
    notePreflightFailed(diag, 'missing', '没有 opencli');

    const records = diag.recent({ code: 'READ_FAILED' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ class: 'env', detail: { phase: 'preflight', reason: '没有 opencli' } });
  });

  it('没有记录器时不抛', () => {
    expect(() => notePreflightFailed(undefined, 'host', 'x')).not.toThrow();
  });
});

describe('启动检查停住：按症状记一条，重试后同症状不重复', () => {
  it('★ DIY 行没有启动 / 名册没有 / 桥接停住 / 版本缺口各一条', () => {
    const diag = createDiagRecorder({ clock: () => 1_000, nextCorrId: () => 'c', level: 'info' });

    notePreflightHold(diag, snapshotOf({ diyGap: { kind: 'broken-row', rows: ['a', 'b'], detail: 'never started' } }));
    notePreflightHold(diag, snapshotOf({ diyGap: { kind: 'preset-missing', rows: [], detail: '没有这一行' } }));
    notePreflightHold(diag, snapshotOf({ hostGap: { tier: 'older', runtime: '0.2.2-rc.5', verified: '0.2.3-alpha.2' } }));
    notePreflightHold(diag, snapshotOf({ bridgeIssues: ['extension'] }));
    notePreflightHold(diag, snapshotOf({ diyGap: { kind: 'broken-row', rows: ['a', 'b'], detail: 'never started' } }));

    expect(diag.recent().map((item) => item.code).sort()).toEqual([
      'PREFLIGHT_BRIDGE_HOLD',
      'PREFLIGHT_DIY_PRESET_MISSING',
      'PREFLIGHT_DIY_ROW_BROKEN',
      'PREFLIGHT_HOST_OLDER',
    ]);
    expect(diag.recent({ code: 'PREFLIGHT_DIY_ROW_BROKEN' })[0]?.detail).toMatchObject({
      phase: 'preflight',
      rows: 'a、b',
      reason: 'never started',
    });
    expect(diag.recent({ code: 'PREFLIGHT_HOST_OLDER' })[0]?.detail).toMatchObject({
      tier: 'older',
      runtime: '0.2.2-rc.5',
      verified: '0.2.3-alpha.2',
    });
    expect(diag.recent({ code: 'PREFLIGHT_BRIDGE_HOLD' })[0]?.detail).toMatchObject({ issues: 'extension' });
  });

  it('版本高于验证时记另一条；older-dsh 不重复记 DIY 行的问题', () => {
    const diag = createDiagRecorder({ clock: () => 1_000, nextCorrId: () => 'c', level: 'info' });
    notePreflightHold(
      diag,
      snapshotOf({
        hostGap: { tier: 'newer', runtime: '0.3.0-rc.1', verified: '0.2.3-alpha.2' },
        diyGap: { kind: 'older-dsh', rows: [], detail: 'x' },
      }),
    );

    expect(diag.recent().map((item) => item.code)).toEqual(['PREFLIGHT_HOST_NEWER']);
  });

  it('★ 失败记录带 stage：读记录的人知道停在哪一步', () => {
    const diag = createDiagRecorder({ clock: () => 1_000, nextCorrId: () => 'c', level: 'info' });
    notePreflightFailed(diag, 'missing', '没有 opencli', 'cli');

    expect(diag.recent({ code: 'READ_FAILED' })[0]?.detail).toMatchObject({
      phase: 'preflight',
      reason: '没有 opencli',
      stage: 'cli',
    });
  });
});
