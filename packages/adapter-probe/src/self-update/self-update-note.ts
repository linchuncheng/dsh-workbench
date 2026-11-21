import type { DiagRecorder } from '@dsh-workbench/shared/host';

export function noteSelfUpdateFailed(diag: DiagRecorder | undefined, version: string, detail: string): void {
  diag?.once(`self-update:${version}`, {
    code: 'SELF_UPDATE_FAILED',
    level: 'error',
    detail: { version, reason: detail },
  });
}
