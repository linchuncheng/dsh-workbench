import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '@dsh-workbench/shared/host';
import { noteSelfUpdateFailed } from '../self-update-note.js';

describe('自更新失败：落一条诊断记录', () => {
  it('★ 记 SELF_UPDATE_FAILED，带版本与原因，同一版本只记一次', () => {
    let at = 1_000;
    const diag = createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });

    noteSelfUpdateFailed(diag, '1.4.4', '装这一版没成（退出码 1）');
    noteSelfUpdateFailed(diag, '1.4.4', '装这一版没成（退出码 1）');

    const records = diag.recent({ code: 'SELF_UPDATE_FAILED' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ class: 'env', area: 'self-update', detail: { version: '1.4.4' } });
    expect(typeof records[0]?.detail?.['reason']).toBe('string');
  });

  it('没有记录器时什么都不做（不抛）', () => {
    expect(() => noteSelfUpdateFailed(undefined, '1.4.4', 'x')).not.toThrow();
  });
});
