import type { DiagCount, DiagRecord, DiagRecorder } from './diag-records.js';

export interface DiagSummary {
  readonly records: readonly DiagRecord[];
  readonly counts: readonly { readonly code: string; readonly count: number; readonly at: number }[];
  readonly total: number;
}

export interface DiagHostCount {
  readonly host: string;
  readonly count: number;
  readonly lastAt: number;
}

export const DIAG_SUMMARY_LIMIT = 50;

export function originsOf(records: readonly DiagRecord[], exclude?: string): readonly DiagHostCount[] {
  const byHost = new Map<string, { count: number; lastAt: number }>();
  for (const record of records) {
    const host = record.host?.profile ?? 'unknown';
    if (host === exclude) continue;
    const seat = byHost.get(host);
    byHost.set(host, {
      count: (seat?.count ?? 0) + 1,
      lastAt: Math.max(seat?.lastAt ?? 0, record.ts),
    });
  }
  return [...byHost.entries()]
    .map(([host, one]) => ({ host, count: one.count, lastAt: one.lastAt }))
    .sort((left, right) => right.lastAt - left.lastAt || left.host.localeCompare(right.host));
}

export function diagSummary(recorder: DiagRecorder, limit = DIAG_SUMMARY_LIMIT): DiagSummary {
  const records = recorder.recent({ limit });
  const counts = [...recorder.counts().entries()]
    .map(([code, one]: [string, DiagCount]) => ({ code, count: one.count, at: one.at }))
    .sort((left, right) => right.at - left.at);
  return { records, counts, total: records.length };
}
