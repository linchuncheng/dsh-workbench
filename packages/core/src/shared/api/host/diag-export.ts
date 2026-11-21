import { buildDiagBundle, writeDiagBundle, type DiagRecord, type DiagRecorder } from '@dsh-workbench/shared/host';

export interface DiagExportInput {
  readonly recorder: DiagRecorder;
  readonly root: string;
  readonly at: string;
  readonly env: Readonly<Record<string, unknown>>;
  readonly config: Readonly<Record<string, unknown>>;
  readonly runtime: Readonly<Record<string, unknown>>;
  readonly checks: Readonly<Record<string, unknown>>;
}

export type DiagExportResult =
  | { readonly ok: true; readonly dir: string; readonly bytes: number; readonly truncated: readonly string[] }
  | { readonly ok: false; readonly code: string; readonly message: string };

export function exportDiagBundle(input: DiagExportInput): DiagExportResult {
  const records: readonly DiagRecord[] = input.recorder.recent();
  const bundle = buildDiagBundle({
    at: input.at,
    env: input.env,
    config: input.config,
    runtime: input.runtime,
    records,
    checks: input.checks,
  });
  try {
    const dir = writeDiagBundle(input.root, input.at, bundle);
    return { ok: true, dir, bytes: bundle.manifest['bytes'] as number, truncated: bundle.truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.recorder.record({
      code: 'DIAG_SINK_FAILED',
      level: 'error',
      detail: { path: 'diagnostics', reason: message },
    });
    return { ok: false, code: 'DIAG_SINK_FAILED', message };
  }
}
