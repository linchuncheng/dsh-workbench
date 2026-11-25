import { describe, expect, it } from 'vitest';
import { createDiagRecorder } from '../diag-records.js';
import type { DiagHost, DiagRecord } from '../diag-records.js';
import { diagSummary, originsOf } from '../diag-summary.js';

function recorderOf() {
  let at = 1_000;
  return createDiagRecorder({ clock: () => (at += 10), nextCorrId: () => 'c-1', level: 'info' });
}

function recordOf(ts: number, host?: DiagHost): DiagRecord {
  return {
    ts,
    level: 'warn',
    code: 'READ_FAILED',
    class: 'env',
    area: 'panels',
    corrId: `c-${String(ts)}`,
    ...(host === undefined ? {} : { host }),
  };
}

describe('诊断摘要（给 agent 读的那份）', () => {
  it('★ 来源摘要：按 profile 计数与最后时间，可排除当前来源', () => {
    const web: DiagHost = { profile: 'web', deployment: 'web', pid: 1 };
    const desktop: DiagHost = { profile: 'desktop', deployment: 'desktop', pid: 2 };
    const records = [recordOf(10, web), recordOf(30, desktop), recordOf(20, web), recordOf(40)];

    expect(originsOf(records)).toEqual([
      { host: 'unknown', count: 1, lastAt: 40 },
      { host: 'desktop', count: 1, lastAt: 30 },
      { host: 'web', count: 2, lastAt: 20 },
    ]);
    expect(originsOf(records, 'web')).toEqual([
      { host: 'unknown', count: 1, lastAt: 40 },
      { host: 'desktop', count: 1, lastAt: 30 },
    ]);
  });
  it('★ 返回最近记录与按码计数，计数按最近时间倒序', () => {
    const diag = recorderOf();
    diag.record({ code: 'READ_FAILED' });
    diag.record({ code: 'CONFIG_CORRUPT' });
    diag.record({ code: 'READ_FAILED' });

    const summary = diagSummary(diag);

    expect(summary.records).toHaveLength(3);
    expect(summary.counts.map((one) => one.code)).toEqual(['READ_FAILED', 'CONFIG_CORRUPT']);
    expect(summary.counts[0]?.count).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('条数上限生效，只取最近的', () => {
    const diag = recorderOf();
    for (let at = 0; at < 5; at += 1) diag.record({ code: 'READ_FAILED', detail: { attempt: at } });

    const summary = diagSummary(diag, 2);

    expect(summary.records).toHaveLength(2);
    expect(summary.records.map((one) => one.detail?.['attempt'])).toEqual([3, 4]);
  });

  it('★ 只读：读两次不产生新记录，计数不涨', () => {
    const diag = recorderOf();
    diag.record({ code: 'READ_FAILED' });

    diagSummary(diag);
    const again = diagSummary(diag);

    expect(diag.recent()).toHaveLength(1);
    expect(again.counts[0]?.count).toBe(1);
  });
});
