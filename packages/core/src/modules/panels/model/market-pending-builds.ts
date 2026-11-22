import type { InstallFailure } from '@dsh-workbench/shared';
import type { PluginPlanStep } from '@dsh-workbench/shared/host';
import {
  approveBuilds,
  blockedBuildNames,
  pendingBuildsOf,
  recordPendingBuilds,
  WorkbenchDataError,
} from '@dsh-workbench/shared/host';

const DIR_FLAG = /--dir\s+(?:'([^']*)'|"([^"]*)"|(\S+))/;

export function policyDirOf(command: string | undefined): string | undefined {
  if (command === undefined) return undefined;
  const match = DIR_FLAG.exec(command);
  const dir = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
  return dir === '' ? undefined : dir;
}

export function pendingBuildsOfError(error: unknown): readonly string[] | undefined {
  if (!(error instanceof WorkbenchDataError)) return undefined;
  const names = error.pendingBuilds;
  return names === undefined || names.length === 0 ? undefined : names;
}

export function approveBuildsIn(
  names: readonly string[] | undefined,
  dirs: readonly (string | null | undefined)[],
): readonly string[] {
  const left = new Set(names ?? []);
  for (const dir of dirs) {
    if (dir === undefined || dir === null) continue;
    const pending = pendingBuildsOf(dir);
    const mine = [...left].filter((name) => pending.includes(name));
    if (mine.length === 0) continue;
    approveBuilds(dir, mine);
    for (const name of mine) left.delete(name);
  }
  return [...left];
}

export function approveBuildsOrProblem(
  names: readonly string[] | undefined,
  dirs: readonly (string | null | undefined)[],
): string | undefined {
  if (names === undefined || names.length === 0) return undefined;
  const unmatched = approveBuildsIn(names, dirs);
  return unmatched.length === 0
    ? undefined
    : `这些包不在等待批准的清单里：${unmatched.join('、')}。请重新安装一次，再查看最新的等待批准清单。`;
}

export interface InstallStep {
  readonly command: string;
  readonly steps?: readonly PluginPlanStep[] | undefined;
}

export interface InstallStepRunner {
  readonly run: (line: string) => Promise<void>;
  readonly runAll: (steps: readonly PluginPlanStep[]) => Promise<void>;
}

export function blockedBuildsError(error: unknown, pending: readonly string[]): WorkbenchDataError {
  const data = error instanceof WorkbenchDataError ? error : undefined;
  return new WorkbenchDataError(
    'build-blocked',
    error instanceof Error ? error.message : String(error),
    {
      ...(data?.detail === undefined ? {} : { detail: data.detail }),
      ...(data?.failure === undefined ? {} : { failure: data.failure }),
      pendingBuilds: pending,
    },
  );
}

export function recordBlockedBuilds(error: unknown): readonly string[] {
  const failure = error instanceof WorkbenchDataError ? (error.failure as InstallFailure | undefined) : undefined;
  if (failure === undefined) return [];
  if (blockedBuildNames(failure.output).length === 0) return [];
  const dir = policyDirOf(failure.command);
  return dir === undefined ? [] : recordPendingBuilds(dir, failure.output);
}

export async function runInstallStep(
  step: InstallStep,
  approved: readonly string[] | undefined,
  buildDirs: readonly string[],
  runner: InstallStepRunner,
): Promise<void> {
  approveBuildsIn(approved, [...buildDirs, policyDirOf(step.command)]);
  try {
    if (step.steps === undefined || step.steps.length === 0) await runner.run(step.command);
    else await runner.runAll(step.steps);
  } catch (error) {
    const pending = recordBlockedBuilds(error);
    if (pending.length === 0) throw error;
    throw blockedBuildsError(error, pending);
  }
}
