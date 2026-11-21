import type { DiagCount, DiagRecord, DiagRecorder } from './diag-records.js';

export interface DiagSummary {
  readonly records: readonly DiagRecord[];
  readonly counts: readonly { readonly code: string; readonly count: number; readonly at: number }[];
  readonly total: number;
}

export const DIAG_SUMMARY_LIMIT = 50;

export function diagSummary(recorder: DiagRecorder, limit = DIAG_SUMMARY_LIMIT): DiagSummary {
  const records = recorder.recent({ limit });
  const counts = [...recorder.counts().entries()]
    .map(([code, one]: [string, DiagCount]) => ({ code, count: one.count, at: one.at }))
    .sort((left, right) => right.at - left.at);
  return { records, counts, total: records.length };
}
