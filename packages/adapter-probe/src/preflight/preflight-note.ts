import type { DiagRecorder } from '@dsh-workbench/shared/host';

export function notePreflightFailed(diag: DiagRecorder | undefined, failure: string, detail: string): void {
  diag?.once(`preflight:${failure}`, {
    code: 'READ_FAILED',
    level: 'error',
    detail: { phase: 'preflight', reason: detail },
  });
}
