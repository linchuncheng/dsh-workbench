import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '@dsh-workbench/shared/host';
import { notePreflightFailed } from '../preflight-note.js';

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
