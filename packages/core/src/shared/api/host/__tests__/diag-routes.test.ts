import { describe, expect, it } from 'vitest';
import { createDiagRecorder, type DiagHost, type DiagRecord } from '@dsh-workbench/shared/host';
import { diagRecordsHandler } from '../diag-routes.js';

function recorderOf() {
  let at = 1_000;
  return createDiagRecorder({
    clock: () => (at += 10),
    nextCorrId: () => 'c-1',
    level: 'info',
  });
}

function searchOf(query: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(query);
}

function recordOf(over: Partial<DiagRecord> = {}): DiagRecord {
  return {
    ts: 1_010,
    level: 'warn',
    code: 'READ_FAILED',
    class: 'env',
    area: 'panels',
    corrId: 'c-1',
    ...over,
  };
}

describe('诊断读路由', () => {
  it('★ 默认读内存：返回 records / total / truncated 三件', () => {
    const recorder = recorderOf();
    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'CONFIG_CORRUPT' });

    const result = diagRecordsHandler({ recorder })(searchOf()) as Record<string, unknown>;

    expect(result['ok']).toBe(true);
    expect(result['total']).toBe(2);
    expect(result['truncated']).toBe(false);
    expect((result['records'] as DiagRecord[]).map((one) => one.code)).toEqual([
      'READ_FAILED',
      'CONFIG_CORRUPT',
    ]);
  });

  it('★ 过滤：区域、类别、码、时间下限', () => {
    const recorder = recorderOf();
    recorder.record({ code: 'READ_FAILED' });
    recorder.record({ code: 'CONFIG_CORRUPT' });
    recorder.record({ code: 'READ_FAILED' });
    const handler = diagRecordsHandler({ recorder });

    const byArea = handler(searchOf({ area: 'settings' })) as { records: DiagRecord[] };
    expect(byArea.records.map((one) => one.code)).toEqual(['CONFIG_CORRUPT']);

    const byClass = handler(searchOf({ class: 'user' })) as { records: DiagRecord[] };
    expect(byClass.records.map((one) => one.code)).toEqual(['CONFIG_CORRUPT']);

    const byCode = handler(searchOf({ code: 'READ_FAILED' })) as { records: DiagRecord[] };
    expect(byCode.records).toHaveLength(2);

    const since = handler(searchOf({ since: '1020' })) as { records: DiagRecord[] };
    expect(since.records).toHaveLength(2);
  });

  it('★ 条数上限截断并标 truncated，总数仍是过滤后的总数', () => {
    const recorder = recorderOf();
    for (let at = 0; at < 5; at += 1) recorder.record({ code: 'READ_FAILED' });

    const result = diagRecordsHandler({ recorder })(searchOf({ limit: '2' })) as Record<string, unknown>;

    expect((result['records'] as DiagRecord[]).length).toBe(2);
    expect(result['total']).toBe(5);
    expect(result['truncated']).toBe(true);
  });

  it('★ 非法参数：统一错误形状，并记一条 DIAG_BAD_PARAM', () => {
    const cases: readonly Record<string, string>[] = [
      { area: 'nope' },
      { class: 'nope' },
      { since: 'abc' },
      { limit: 'abc' },
      { source: 'nope' },
    ];
    for (const query of cases) {
      const recorder = recorderOf();
      const result = diagRecordsHandler({ recorder })(searchOf(query)) as Record<string, unknown>;
      expect(result['ok'], JSON.stringify(query)).toBe(false);
      expect((result['error'] as { code: string }).code, JSON.stringify(query)).toBe('bad-request');
      expect(recorder.recent({ code: 'DIAG_BAD_PARAM' }), JSON.stringify(query)).toHaveLength(1);
    }
  });

  it('★ 成功调用不产生记录（只读）', () => {
    const recorder = recorderOf();
    recorder.record({ code: 'READ_FAILED' });
    const before = recorder.recent().length;

    diagRecordsHandler({ recorder })(searchOf({ limit: '1' }));

    expect(recorder.recent().length).toBe(before);
  });

  it('★ 默认当前宿主；host=* 与指定宿主可读；host 字段带 profile/deployment/pid', () => {
    const web: DiagHost = { profile: 'web', deployment: 'web', pid: 11 };
    const desktop: DiagHost = { profile: 'desktop', deployment: 'desktop', pid: 22 };
    const recorder = createDiagRecorder({
      clock: () => 1_010,
      nextCorrId: () => 'c-1',
      level: 'info',
      host: web,
    });
    recorder.record({ code: 'READ_FAILED' });
    const disk = {
      records: [
        recordOf({ ts: 5, host: web }),
        recordOf({ ts: 6, code: 'CONFIG_CORRUPT', class: 'user', area: 'settings', host: desktop }),
        recordOf({ ts: 7 }),
      ],
      skipped: 0,
      read: 3,
    };
    const handler = diagRecordsHandler({
      recorder,
      host: web,
      dirOf: () => '/profiles/web',
      clock: () => Date.parse('2026-11-21T10:00:00.000Z'),
      readDisk: () => disk,
    });

    const current = handler(searchOf({ source: 'disk' })) as Record<string, unknown>;
    expect((current['records'] as DiagRecord[]).map((one) => one.ts)).toEqual([5]);
    expect(current['hosts']).toEqual(['desktop', 'unknown', 'web']);
    expect(current['host']).toMatchObject({ profile: 'web', profileDir: '/profiles/web', deployment: 'web', pid: 11 });

    const byDesktop = handler(searchOf({ source: 'disk', host: 'desktop' })) as { records: DiagRecord[] };
    const byUnknown = handler(searchOf({ source: 'disk', host: 'unknown' })) as { records: DiagRecord[] };
    const byAll = handler(searchOf({ source: 'disk', host: '*' })) as { records: DiagRecord[] };
    expect(byDesktop.records).toHaveLength(1);
    expect(byUnknown.records).toHaveLength(1);
    expect(byAll.records).toHaveLength(3);
  });

  it('★ source=memory 只接受当前宿主；* 与其他宿主明确报错', () => {
    const web: DiagHost = { profile: 'web', deployment: 'web', pid: 11 };
    const recorder = createDiagRecorder({ clock: () => 1_010, nextCorrId: () => 'c-1', level: 'info', host: web });
    recorder.record({ code: 'READ_FAILED' });
    const handler = diagRecordsHandler({ recorder, host: web });

    for (const host of ['desktop', '*']) {
      const result = handler(searchOf({ host })) as Record<string, unknown>;
      expect(result['ok'], host).toBe(false);
      expect((result['error'] as { code: string }).code, host).toBe('bad-request');
    }
    expect(recorder.recent({ code: 'DIAG_BAD_PARAM' })).toHaveLength(2);
    const current = handler(searchOf({ host: 'web' })) as { records: DiagRecord[] };
    expect(current.records.filter((one) => one.code === 'READ_FAILED')).toHaveLength(1);
  });

  it('★ source=disk 与内存同形；没接落盘时给出明确错误而不是空表', () => {
    const recorder = recorderOf();
    const disk = {
      records: [recordOf({ ts: 5 }), recordOf({ ts: 9, code: 'CONFIG_CORRUPT', class: 'user', area: 'settings' })],
      skipped: 0,
      read: 2,
    };
    const withDisk = diagRecordsHandler({
      recorder,
      clock: () => Date.parse('2026-11-21T10:00:00.000Z'),
      readDisk: (day) => (day === '2026-11-21' ? disk : { records: [], skipped: 0, read: 0 }),
    });

    const result = withDisk(searchOf({ source: 'disk' })) as { records: DiagRecord[]; total: number };
    expect(result.records.map((one) => one.code)).toEqual(['READ_FAILED', 'CONFIG_CORRUPT']);
    expect(result.total).toBe(2);

    const withoutDisk = diagRecordsHandler({ recorder })(searchOf({ source: 'disk' })) as Record<string, unknown>;
    expect(withoutDisk['ok']).toBe(false);
    expect(recorder.recent({ code: 'DIAG_BAD_PARAM' })).toHaveLength(1);
  });
});
