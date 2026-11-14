import { basename, dirname } from 'node:path';
import {
  acquireUpdateLease,
  activeHostLeases,
  clearReinstallRecord,
  readReinstallRecord,
  reinstallRecordFile,
  tailLines,
  writeReinstallRecord,
  type ProcessHost,
} from '@dsh-workbench/shared/host';
import { profileInstallArgs, runSelfUpdateCommand } from './self-update-run.js';
import type { SelfUpdateSteps } from './self-update-steps.js';

export const SELF_UPDATE_REINSTALL_WAIT_MS = 900_000;

export const SELF_UPDATE_REINSTALL_POLL_MS = 3_000;

/** 连续几次看不到活窗口才动手，避开“旧窗口刚退、新窗口正在起”的空档。 */
export const SELF_UPDATE_REINSTALL_IDLE_POLLS = 3;

/** 自动重装最多试几次；超过就让用户手动处理，别无限改写 profile。 */
export const SELF_UPDATE_REINSTALL_MAX_ATTEMPTS = 3;

/** 单次 pnpm install 最长跑多久；卡死时按失败处理，别把更新锁永久占着。 */
export const SELF_UPDATE_REINSTALL_TIMEOUT_MS = 10 * 60_000;

export interface SelfUpdateReinstallDeps {
  readonly processes: ProcessHost;
  readonly now?: (() => string) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly waitMs?: number | undefined;
  readonly pollMs?: number | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export type SelfUpdateReinstallOutcome = 'done' | 'pending' | 'failed' | 'not-needed';

export async function reinstallProfileWhenIdle(
  plan: SelfUpdateSteps,
  deps: SelfUpdateReinstallDeps,
): Promise<SelfUpdateReinstallOutcome> {
  const install = plan.steps.find((step) => step.kind === 'install');
  if (install === undefined) return 'not-needed';
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date().toISOString());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const file = reinstallRecordFile(dirname(plan.markerPath));
  const prior = readReinstallRecord(file);
  // 记录通常已经在 switch 提交时写好；这里只兜底补一条，别把失败次数清零。
  if (prior === undefined) writeRecord(file, 'pending', plan, now(), log);
  if ((prior?.attempts ?? 0) >= SELF_UPDATE_REINSTALL_MAX_ATTEMPTS) {
    log(`profile 重装已经连续失败 ${String(prior?.attempts)} 次，先不再自动重试`);
    return 'failed';
  }
  const deadline = Date.parse(now()) + (deps.waitMs ?? SELF_UPDATE_REINSTALL_WAIT_MS);
  let idle = 0;
  for (;;) {
    idle = activeHostLeases(plan.profileDir).length === 0 ? idle + 1 : 0;
    if (idle >= SELF_UPDATE_REINSTALL_IDLE_POLLS) break;
    if (Date.parse(now()) >= deadline) return 'pending';
    await sleep(deps.pollMs ?? SELF_UPDATE_REINSTALL_POLL_MS);
  }
  let lease;
  try {
    lease = acquireUpdateLease({ root: dirname(plan.markerPath), pid: process.pid, kind: 'reinstall' });
  } catch (error) {
    log(`重装锁没写上：${messageOf(error)}`);
    return 'pending';
  }
  if (lease === undefined) return 'pending';
  try {
    // 拿到锁之后重读：启动器可能已经把这个记录消费掉，或失败次数已经涨到上限。
    const latest = readReinstallRecord(file);
    if (latest === undefined) return 'done';
    if ((latest.attempts ?? 0) >= SELF_UPDATE_REINSTALL_MAX_ATTEMPTS) {
      log(`profile 重装已经连续失败 ${String(latest.attempts)} 次，先不再自动重试`);
      return 'failed';
    }
    if (activeHostLeases(plan.profileDir).length > 0) return 'pending';
    const args = profileInstallArgs(install.args[0], plan.profileDir);
    const outcome = await runSelfUpdateCommand(
      { ...install, args: [...args], cwd: plan.profileDir },
      { ...deps, timeoutMs: SELF_UPDATE_REINSTALL_TIMEOUT_MS },
    );
    if (outcome.code === 0) {
      try {
        clearReinstallRecord(file);
      } catch (error) {
        log(`待重装记录没清掉：${messageOf(error)}`);
      }
      log('profile 已按新的 link 重装（旧 shared 带进来的 dsh 包会被清掉）');
      return 'done';
    }
    writeRecord(file, 'failed', plan, now(), log, tailLines(outcome.output, 4), latest.attempts ?? 0);
    log(`profile 重装没成（退出码 ${String(outcome.code)}）：${tailLines(outcome.output, 4)}`);
    return 'failed';
  } finally {
    lease.release();
  }
}

function writeRecord(
  file: string,
  state: 'pending' | 'failed',
  plan: SelfUpdateSteps,
  at: string,
  log: (message: string) => void,
  reason?: string,
  priorAttempts = 0,
): void {
  try {
    writeReinstallRecord(file, {
      schema: 1,
      state,
      profile: basename(plan.profileDir),
      profileDir: plan.profileDir,
      version: plan.version,
      from: plan.marker.from,
      at,
      ...(state === 'failed' ? { attempts: priorAttempts + 1 } : priorAttempts === 0 ? {} : { attempts: priorAttempts }),
      ...(reason === undefined ? {} : { reason }),
    });
  } catch (error) {
    log(`待重装记录没写成：${messageOf(error)}`);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
