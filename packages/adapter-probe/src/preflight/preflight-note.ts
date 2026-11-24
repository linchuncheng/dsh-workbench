import type { DiagRecorder, PreflightSnapshot } from '@dsh-workbench/shared/host';

export function notePreflightFailed(
  diag: DiagRecorder | undefined,
  failure: string,
  detail: string,
  stage?: string,
): void {
  diag?.once(`preflight:${failure}`, {
    code: 'READ_FAILED',
    level: 'error',
    detail: { phase: 'preflight', reason: detail, ...(stage === undefined || stage === '' ? {} : { stage }) },
  });
}

export function notePreflightHold(diag: DiagRecorder | undefined, snapshot: PreflightSnapshot): void {
  const diy = snapshot.diyGap;
  if (diy !== undefined && diy.kind !== 'older-dsh') {
    const code = diy.kind === 'preset-missing' ? 'PREFLIGHT_DIY_PRESET_MISSING' : 'PREFLIGHT_DIY_ROW_BROKEN';
    diag?.once(`preflight:${code}:${diy.rows.join(',')}`, {
      code,
      level: 'warn',
      detail: {
        phase: 'preflight',
        reason: diy.detail,
        ...(diy.rows.length === 0 ? {} : { rows: diy.rows.join('、') }),
      },
    });
  }
  const gap = snapshot.hostGap;
  if (gap !== undefined) {
    const code = gap.tier === 'older' ? 'PREFLIGHT_HOST_OLDER' : 'PREFLIGHT_HOST_NEWER';
    diag?.once(`preflight:${code}:${gap.runtime}`, {
      code,
      level: 'warn',
      detail: { phase: 'preflight', tier: gap.tier, runtime: gap.runtime, verified: gap.verified },
    });
  }
  const issues = snapshot.bridgeIssues ?? [];
  if (issues.length > 0) {
    diag?.once(`preflight:bridge:${issues.join(',')}`, {
      code: 'PREFLIGHT_BRIDGE_HOLD',
      level: 'warn',
      detail: { phase: 'preflight', issues: issues.join('、') },
    });
  }
}
