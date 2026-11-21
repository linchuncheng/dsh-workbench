export interface UIADiagRecord {
  readonly ts: number;
  readonly level: 'info' | 'warn' | 'error';
  readonly code: string;
  readonly area: string;
}

type DiagRecord = UIADiagRecord;

export interface DiagRow {
  readonly at: number;
  readonly area: string;
  readonly code: string;
  readonly level: DiagRecord['level'];
  readonly count: number;
}

export interface DiagSummaryLike {
  readonly records: readonly DiagRecord[];
  readonly counts: readonly { readonly code: string; readonly count: number; readonly at: number }[];
}

export type ExportOutcome =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'done'; readonly dir: string }
  | { readonly kind: 'failed'; readonly code: string; readonly message: string };

export function diagRowsOf(summary: DiagSummaryLike): readonly DiagRow[] {
  const counted = new Map(summary.counts.map((one) => [one.code, one.count]));
  const seen = new Set<string>();
  const rows: DiagRow[] = [];
  for (const record of [...summary.records].reverse()) {
    if (seen.has(record.code)) continue;
    seen.add(record.code);
    rows.push({
      at: record.ts,
      area: record.area,
      code: record.code,
      level: record.level,
      count: counted.get(record.code) ?? 1,
    });
  }
  return rows;
}

export function exportResultOf(raw: unknown): ExportOutcome {
  if (typeof raw !== 'object' || raw === null) return { kind: 'failed', code: 'DIAG_SINK_FAILED', message: '导出没有返回结果' };
  const shaped = raw as { ok?: unknown; dir?: unknown; code?: unknown; message?: unknown };
  if (shaped.ok === true && typeof shaped.dir === 'string') return { kind: 'done', dir: shaped.dir };
  return {
    kind: 'failed',
    code: typeof shaped.code === 'string' ? shaped.code : 'DIAG_SINK_FAILED',
    message: typeof shaped.message === 'string' ? shaped.message : '导出没有成功',
  };
}
