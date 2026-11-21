import { describe, expect, it } from 'vitest';
import { diagRowsOf, exportResultOf } from '../diag-view.js';

function recordOf(code: string, ts: number, area = 'panels') {
  return { ts, level: 'warn' as const, code, area };
}

describe('诊断页的投影', () => {
  it('★ 同一个码只留最近一条，带上总次数，按时间倒序', () => {
    const rows = diagRowsOf({
      records: [recordOf('READ_FAILED', 1), recordOf('CONFIG_CORRUPT', 2), recordOf('READ_FAILED', 3)],
      counts: [
        { code: 'READ_FAILED', count: 2, at: 3 },
        { code: 'CONFIG_CORRUPT', count: 1, at: 2 },
      ],
    });

    expect(rows.map((one) => one.code)).toEqual(['READ_FAILED', 'CONFIG_CORRUPT']);
    expect(rows[0]?.count).toBe(2);
  });

  it('★ 导出成功给目录，失败给码与人话', () => {
    expect(exportResultOf({ ok: true, dir: '/x/diagnostics/1', bytes: 10 })).toEqual({ kind: 'done', dir: '/x/diagnostics/1' });
    expect(exportResultOf({ ok: false, code: 'DIAG_SINK_FAILED', message: '磁盘满' })).toEqual({
      kind: 'failed',
      code: 'DIAG_SINK_FAILED',
      message: '磁盘满',
    });
    expect(exportResultOf(undefined)).toMatchObject({ kind: 'failed', code: 'DIAG_SINK_FAILED' });
  });
});
