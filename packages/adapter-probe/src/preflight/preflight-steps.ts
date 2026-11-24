import type {
  PreflightDiyGap,
  PreflightHostGap,
  PreflightHostStanding,
  PreflightStep,
  PreflightStepId,
} from '@dsh-workbench/shared/host';
import { DIY_UPGRADE_COMMAND, type DiyPresetVerdict } from './diy-preset-health.js';

export interface StepSink {
  readonly steps: readonly PreflightStep[];
  patch(id: PreflightStepId, patch: Partial<PreflightStep>): void;
  drop(id: PreflightStepId): void;
}

export function pendingStep(id: PreflightStepId, label?: string): PreflightStep {
  return { id, status: 'pending', ...(label === undefined || label === '' ? {} : { label }) };
}

export function settleHostStep(
  standing: PreflightHostStanding | undefined,
  sink: StepSink,
): PreflightHostGap | undefined {
  if (standing === undefined) {
    sink.drop('host');
    return undefined;
  }
  const log = standing.log === undefined ? {} : { log: [...standing.log] };
  if (standing.tier === 'ok') {
    sink.patch('host', { status: 'ok', ...log });
    return undefined;
  }
  sink.patch('host', {
    status: 'warn',
    detail: standing.runtime,
    ...(standing.command === undefined ? {} : { command: standing.command }),
    ...log,
  });
  return standing;
}

export async function settleDiyStep(
  started: Promise<DiyPresetVerdict | undefined> | undefined,
  sink: StepSink,
  logger?: { warn?(message: string): void },
): Promise<PreflightDiyGap | undefined> {
  if (started === undefined) return undefined;
  const verdict = await started.catch((error: unknown) => {
    logger?.warn?.(
      `[dsh-workbench] 启动检查读 DIY 模式列表失败：${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  });
  if (verdict === undefined) {
    sink.drop('diy');
    return undefined;
  }
  if (verdict.ok) {
    sink.patch('diy', { status: 'ok', detail: verdict.detail });
    return undefined;
  }
  sink.patch('diy', { status: 'warn', detail: verdict.detail, command: DIY_UPGRADE_COMMAND });
  return { rows: verdict.rows, detail: verdict.detail, command: DIY_UPGRADE_COMMAND };
}
