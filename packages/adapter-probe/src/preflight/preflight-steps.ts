import type {
  PreflightDiyGap,
  PreflightHostFacts,
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

export interface SettledHost {
  readonly gap?: PreflightHostGap;
  readonly facts?: PreflightHostFacts;
}

export function settleHostStep(
  standing: PreflightHostStanding | undefined,
  sink: StepSink,
): SettledHost {
  if (standing === undefined) {
    sink.drop('host');
    return {};
  }
  const log = standing.log === undefined ? {} : { log: [...standing.log] };
  const facts = standing.facts === undefined ? {} : { facts: standing.facts };
  if (standing.tier === 'ok') {
    sink.patch('host', { status: 'ok', ...log });
    return facts;
  }
  sink.patch('host', {
    status: 'warn',
    detail: standing.runtime,
    ...(standing.command === undefined ? {} : { command: standing.command }),
    ...log,
  });
  return { gap: standing, ...facts };
}

export async function settleDiyStep(
  started: Promise<DiyPresetVerdict | undefined> | undefined,
  sink: StepSink,
  logger?: { warn?(message: string): void },
  olderDsh = false,
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
  const kind = olderDsh ? 'older-dsh' : verdict.rows.length === 0 ? 'preset-missing' : 'broken-row';
  const command = kind === 'older-dsh' ? { command: DIY_UPGRADE_COMMAND } : {};
  sink.patch('diy', { status: 'warn', detail: verdict.detail, ...command });
  return { kind, rows: verdict.rows, detail: verdict.detail, ...command };
}
