import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  activeHostLeases,
  clearReinstallRecord,
  ensureProfileBundle,
  ensureReleaseAge,
  readReinstallRecord,
  reconcileWorkbenchLinks,
  reinstallRecordFile,
  removePath,
  restoreUpdateJournal,
  tailLines,
  updateJournalFile,
  writeJsonFile,
  writeReinstallRecord,
  writeUpdateJournal,
  type ProcessHost,
  type UpdateJournalRecord,
} from '@dsh-workbench/shared/host';
import type { SelfUpdateFailure } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type {
  SelfUpdateExpectBootStep,
  SelfUpdateStep,
  SelfUpdateSteps,
} from './self-update-steps.js';
import { bootVerdict, readBootRecord } from './self-update-boot.js';
import { pruneVersions } from './self-update-prune.js';
import {
  carryPreviousVersion,
  flipProfileLinks,
  versionMissingOf,
  versionSelfCheck,
  versionTreeNoteOf,
  writeProfileLinks,
  writeVersionProject,
  type VersionLink,
} from './version/version-dir.js';
import { switchJournalOf } from './version/version-switch.js';
import { noteSelfUpdateFailed } from './self-update-note.js';
import { versionGateOf, type VersionEntryProbe } from './version/version-gate.js';
import { isRealDir } from './version/version-migrate.js';
import { runSelfUpdateCommand } from './self-update-command.js';

export { runSelfUpdateCommand, profileInstallArgs } from './self-update-command.js';

export interface SelfUpdateRunDeps {
  readonly processes: ProcessHost;
  readonly now?: (() => string) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly flip?: ((links: readonly VersionLink[]) => void) | undefined;
  readonly writeManifest?: ((input: { readonly profileDir: string; readonly links: readonly VersionLink[] }) => void) | undefined;
  readonly entryProbe?: VersionEntryProbe | undefined;
  readonly inUseWaitMs?: number | undefined;
  readonly diag?: import('@dsh-workbench/shared/host').DiagRecorder | undefined;
  readonly inUsePollMs?: number | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export const SELF_UPDATE_INUSE_WAIT_MS = 900_000;

export const SELF_UPDATE_INUSE_POLL_MS = 2_000;

export interface SelfUpdateRunResult {
  readonly ok: boolean;
  readonly state: 'ok' | 'pending' | 'failed';
  readonly detail: string;
  readonly ran: readonly string[];
  readonly failure?: SelfUpdateFailure | undefined;
  readonly requirements?: Readonly<Record<string, string>> | undefined;
}

interface StepOutcome {
  readonly ok: boolean;
  readonly detail: string;
  readonly marks?: 'flip' | undefined;
  readonly committed?: true | undefined;
  readonly state?: SelfUpdateRunResult['state'] | undefined;
  readonly failure?: SelfUpdateFailure | undefined;
  readonly requirements?: Readonly<Record<string, string>> | undefined;
}

export function selfUpdateJournalPath(plan: SelfUpdateSteps): string {
  return updateJournalFile(dirname(plan.markerPath));
}

export async function runSelfUpdateSteps(
  plan: SelfUpdateSteps,
  deps: SelfUpdateRunDeps,
): Promise<SelfUpdateRunResult> {
  const diag = deps.diag;
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date().toISOString());
  const ran: string[] = [];
  let flippedAt = now();
  let committed = false;
  for (const step of plan.steps) {
    const outcome = await stepOutcome(plan, step, deps, now, log, flippedAt);
    if (outcome.marks === 'flip') flippedAt = now();
    if (outcome.committed === true) committed = true;
    if (!outcome.ok) {
      const manifest = holdBundles(plan, log);
      const detail = `${outcome.detail}；${manifest}`;
      if (committed) {
        log(detail);
        log(`${plan.version} 已经提交，重启后生效`);
        writeCommittedMarker(plan, now, log);
        return { ok: true, state: 'pending', detail, ran };
      }
      writeJsonFile(plan.markerPath, {
        ...plan.marker,
        state: 'failed',
        version: plan.marker.from,
        reason: 'incomplete',
        at: now(),
        ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
        ...(outcome.requirements === undefined ? {} : { requirements: outcome.requirements }),
      });
      log(detail);
      log(`救法：${plan.rescue}`);
      noteSelfUpdateFailed(diag, plan.version, detail);
      return { ok: false, state: 'failed', detail, ran, ...(outcome.failure === undefined ? {} : { failure: outcome.failure }), ...(outcome.requirements === undefined ? {} : { requirements: outcome.requirements }) };
    }
    ran.push(step.kind);
    log(outcome.detail);
    if (outcome.state === 'pending') return { ok: true, state: 'pending', detail: outcome.detail, ran };
    if (outcome.state === 'failed') {
      noteSelfUpdateFailed(diag, plan.version, outcome.detail);
      return { ok: false, state: 'failed', detail: outcome.detail, ran };
    }
  }
  return { ok: true, state: 'ok', detail: `${plan.version} 已就绪，重启后生效`, ran };
}

function writeCommittedMarker(plan: SelfUpdateSteps, now: () => string, log: (message: string) => void): void {
  try {
    writeJsonFile(plan.markerPath, {
      ...plan.marker,
      state: 'pending-restart',
      version: plan.version,
      at: now(),
      phase: 'committed',
      committed: true,
    });
  } catch (error) {
    log(`状态文件没写成（${messageOf(error)}），换版本身已经生效`);
  }
}

function writePendingReinstall(plan: SelfUpdateSteps, at: string, log: (message: string) => void): void {
  try {
    const file = reinstallRecordFile(dirname(plan.markerPath));
    writeReinstallRecord(file, {
      schema: 1,
      state: 'pending',
      profile: basename(plan.profileDir),
      profileDir: plan.profileDir,
      version: plan.version,
      from: plan.marker.from,
      at,
    });
  } catch (error) {
    log(`待重装记录没写成（${messageOf(error)}），重启后要靠启动器兜底`);
  }
}

function holdBundles(plan: SelfUpdateSteps, log: (message: string) => void): string {
  try {
    const check = ensureProfileBundle(plan.profileDir, plan.bundle);
    if (check.refusal !== undefined) return `清单里那一行没能确认（${check.refusal}）—— 按下面那条救法做`;
    return check.repaired ? `清单里那一行缺了，已补回 ${plan.bundle}` : `清单里 ${plan.bundle} 那一行还在`;
  } catch (error) {
    log(`清单那一行没核对完：${messageOf(error)}`);
    return '清单里那一行没核对完';
  }
}

function carryDoneOf(record: UpdateJournalRecord): number {
  return record.carry.filter((item) => !isRealDir(item.from) && existsSync(item.to)).length;
}

async function stepOutcome(
  plan: SelfUpdateSteps,
  step: SelfUpdateStep,
  deps: SelfUpdateRunDeps,
  now: () => string,
  log: (message: string) => void,
  flippedAt: string,
): Promise<StepOutcome> {
  try {
    return await applyStep(plan, step, deps, now, log, flippedAt);
  } catch (error) {
    return { ok: false, detail: `${step.kind} 这一步抛了：${error instanceof Error ? error.message : String(error)}` };
  }
}

async function applyStep(
  plan: SelfUpdateSteps,
  step: SelfUpdateStep,
  deps: SelfUpdateRunDeps,
  now: () => string,
  log: (message: string) => void,
  flippedAt: string,
): Promise<StepOutcome> {
  if (step.kind === 'version') {
    writeVersionProject(step.project);
    return { ok: true, detail: `版本目录已铺好：${step.project.dir}` };
  }
  if (step.kind === 'install') {
    const first = await runSelfUpdateCommand(step, deps);
    if (first.code !== 0) {
      return { ok: false, detail: `装这一版没成（退出码 ${first.code === null ? '拿不到' : String(first.code)}）：${tailLines(first.output, 8)}` };
    }
    const missing = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
    if (missing.length === 0) return { ok: true, detail: `安装完成：${plan.version}` };
    log(`装完少了 ${String(missing.length)} 个包（${missing.join('、')}），清掉 node_modules 重装一遍`);
    removePath(join(plan.versionDir, 'node_modules'));
    const second = await runSelfUpdateCommand(step, deps);
    const still = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
    if (second.code !== 0 || still.length > 0) {
      return {
        ok: false,
        detail: `装了两遍还是不全（${still.length > 0 ? still.join('、') : 'pnpm 退出码不对'}）：${tailLines(second.output, 6)}`,
      };
    }
    return { ok: true, detail: `重装一遍补齐了：${plan.version}` };
  }
  if (step.kind === 'verify') {
    const good = versionSelfCheck({ versionDir: step.versionDir, version: step.version, packages: step.packages });
    return good
      ? { ok: true, detail: '装完自检过了' }
      : { ok: false, detail: '装完自检没过：版本目录里的包或客户端产物不全' };
  }
  if (step.kind === 'switch') {
    const broken = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
    if (broken.length > 0) {
      return { ok: false, detail: `版本目录不全（${broken.join('、')}），不切过去：${plan.versionDir}` };
    }
    const gate = versionGateOf({
      versionDir: plan.versionDir,
      packages: plan.packages,
      ...(plan.dshVersion === undefined ? {} : { dshVersion: plan.dshVersion }),
      ...(deps.entryProbe === undefined ? {} : { probe: deps.entryProbe }),
    });
    if (!gate.ok) {
      return { ok: false, detail: `新版本没通过切换前检查：${gate.violations.join('；')} —— 不切过去` };
    }
    if (gate.compatibility.verdict === 'incompatible') {
      const need = gate.compatibility.requirements.map((item) => `${item.pkg} 要 ${item.range}`).join('、');
      const requirements = Object.fromEntries(
        gate.compatibility.requirements.map((item) => [item.source === 'engines' ? 'engines.dsh' : item.pkg, item.range]),
      );
      return {
        ok: false,
        detail: `新版本跟这一台 dsh ${plan.dshVersion ?? ''} 不兼容（${need}），不切过去`,
        failure: 'incompatible',
        requirements,
      };
    }
    if (gate.compatibility.verdict === 'unknown') {
      log(`兼容性未知（${gate.compatibility.reason}），已经做过隔离入口检查`);
    }
    const journalPath = selfUpdateJournalPath(plan);
    let record = switchJournalOf({
      profileDir: step.profileDir,
      versionsDir: plan.versionsDir,
      versionDir: plan.versionDir,
      from: plan.marker.from,
      to: plan.version,
      links: step.links,
      ...(step.carry === undefined ? {} : { carry: step.carry }),
      at: now(),
    });
    try {
      writeUpdateJournal(journalPath, record);
    } catch (error) {
      return { ok: false, detail: `换版事务日志没写上，这一步没动任何东西：${messageOf(error)}` };
    }
    const persist = (patch: Partial<UpdateJournalRecord>): void => {
      const next = { ...record, ...patch, updatedAt: now() };
      try {
        writeUpdateJournal(journalPath, next);
      } catch (error) {
        throw new Error(`换版事务日志没写成：${messageOf(error)}`, { cause: error });
      }
      record = next;
    };
    const flip = deps.flip;
    const recheck = (when: string): void => {
      const broken = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
      if (broken.length === 0) return;
      const note = versionTreeNoteOf({ versionDir: plan.versionDir, packages: plan.packages });
      throw new Error(`${when}（${broken.join('、')}）${note === '' ? '' : `：${note}`}，按事务日志回到 ${plan.marker.from}`);
    };
    const run = (): void => {
      const hosts = activeHostLeases(step.profileDir).filter((lease) => lease.pid !== plan.requesterPid);
      if (step.waitForHosts === true && hosts.length > 0) {
        throw Object.assign(new Error('这个 profile 还有窗口在用'), { code: 'EBUSY' });
      }
      if (step.carry !== undefined && record.carried < record.carry.length) {
        try {
          carryPreviousVersion({ profileDir: step.profileDir, ...step.carry });
        } finally {
          persist({ state: 'carrying', carried: carryDoneOf(record) });
        }
      }
      recheck('搬完上一版之后版本目录不全');
      if (record.state !== 'flipping') persist({ state: 'flipping' });
      if (flip !== undefined) {
        flip(step.links.slice(record.cursor));
        persist({ cursor: step.links.length });
        recheck('翻完链之后版本目录不全');
        return;
      }
      while (record.cursor < step.links.length) {
        const link = step.links[record.cursor];
        if (link === undefined) break;
        flipProfileLinks([link]);
        persist({ cursor: record.cursor + 1 });
      }
      recheck('翻完链之后版本目录不全');
    };
    const flipped = await waitOutInUse(run, deps, now);
    if (!flipped.ok) {
      const restored = restoreUpdateJournal({ record, file: journalPath, log });
      return { ok: false, detail: `${flipped.detail}；${restored.detail}` };
    }
    const writeManifest = deps.writeManifest ?? writeProfileLinks;
    try {
      persist({ state: 'manifest' });
      writeManifest({ profileDir: step.profileDir, links: step.links });
      try {
        const aligned = reconcileWorkbenchLinks({ profileDir: step.profileDir, versionDir: plan.versionDir });
        if (aligned.changed.length > 0) {
          log(`工作台链接已对齐到 ${plan.version}（${aligned.changed.join('、')}）`);
        }
      } catch (error) {
        log(`工作台链接没对齐（${messageOf(error)}）：下次在配置里装模块可能按旧版本安装`);
      }
      writePendingReinstall(plan, now(), log);
      persist({ state: 'committed' });
    } catch (error) {
      const restored = restoreUpdateJournal({ record, file: journalPath, log });
      if (restored.ok && plan.version !== plan.marker.from) {
        try {
          const file = reinstallRecordFile(dirname(plan.markerPath));
          const pending = readReinstallRecord(file);
          if (pending === undefined || pending.version === plan.version) clearReinstallRecord(file);
        } catch (clearError) {
          log(`重新安装记录未清除（${messageOf(clearError)}），下次启动可能多执行一次 install`);
        }
      }
      return { ok: false, detail: `清单写入失败（${messageOf(error)}）；${restored.detail}` };
    }
    writeCommittedMarker(plan, now, log);
    ensureReleaseAge({ dir: step.profileDir, packages: plan.packages });
    return {
      ok: true,
      detail: `${
        flipped.waited
          ? `已经指到 ${plan.versionDir}（退出当前进程后切换，重启后生效）`
          : `已经指到 ${plan.versionDir}（重启后生效）`
      }`,
      marks: 'flip',
      committed: true,
    };
  }
  if (step.kind === 'expect-boot') return expectBoot(plan, step, deps, now, flippedAt, log);
  if (step.kind === 'prune') {
    const result = pruneVersions({
      versionsDir: step.versionsDir,
      profilesDir: step.profilesDir,
      keep: step.keep,
    });
    const kept = result.kept.length === 0 ? '没有别的' : result.kept.join('、');
    const removed =
      result.removed.length === 0 ? '旧版本目录没动' : `清掉了 ${String(result.removed.length)} 个旧版本（${result.removed.join('、')}）`;
    const failed = result.failed.length === 0 ? '' : `；这 ${String(result.failed.length)} 个没清掉（${result.failed.join('、')}）`;
    return { ok: true, detail: `${removed}，留着 ${kept}${failed}` };
  }
  if (step.kind === 'bundles') {
    const check = ensureProfileBundle(step.profileDir, step.bundle);
    if (check.refusal !== undefined) {
      return { ok: false, detail: `清单里那一行没法确认（${check.refusal}）：${check.path}` };
    }
    return check.repaired
      ? { ok: true, detail: `清单里缺了 ${step.bundle} 这一行，已经补回` }
      : { ok: true, detail: `清单里 ${step.bundle} 那一行一直都在` };
  }
  const broken = versionMissingOf({ versionDir: plan.versionDir, version: plan.version, packages: plan.packages });
  if (broken.length > 0) {
    return {
      ok: false,
      detail: `切过去之前又不对了（${broken.join('、')}）：${plan.versionDir}`,
    };
  }
  writeJsonFile(plan.markerPath, {
    ...plan.marker,
    state: step.state,
    version: step.version,
    at: now(),
    phase: 'committed',
    committed: true,
  });
  log(`marker 落 ${step.state}`);
  return { ok: true, detail: `${plan.version} 已就绪，重启后生效` };
}

async function expectBoot(
  plan: SelfUpdateSteps,
  step: SelfUpdateExpectBootStep,
  deps: SelfUpdateRunDeps,
  now: () => string,
  since: string,
  log: (message: string) => void,
): Promise<StepOutcome> {
  const { boot } = step;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.parse(now()) + boot.windowMs;
  for (;;) {
    const verdict = bootVerdict({
      target: boot.target,
      since,
      boot: readBootRecord(boot.file),
      up: readBootRecord(boot.upFile),
      now: now(),
    });
    if (verdict === 'confirmed') {
      try {
        writeJsonFile(plan.markerPath, {
          ...plan.marker,
          state: 'ok',
          version: boot.target,
          at: now(),
          phase: 'committed',
          committed: true,
        });
      } catch (error) {
        log(`状态文件没写成（${messageOf(error)}），这一版已经起来了`);
      }
      return { ok: true, detail: `${boot.target} 起来了，这一版确认可用` };
    }
    if (Date.parse(now()) >= deadline) {
      return { ok: true, detail: `还没重启过，${boot.target} 先留着（重启后生效）`, state: 'pending' };
    }
    await sleep(boot.pollMs);
  }
}

const IN_USE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

function inUse(error: unknown): boolean {
  const code = (error as { readonly code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && IN_USE_CODES.has(code);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitOutInUse(
  run: () => void,
  deps: SelfUpdateRunDeps,
  now: () => string,
): Promise<{ readonly ok: true; readonly waited: boolean } | { readonly ok: false; readonly detail: string }> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.parse(now()) + (deps.inUseWaitMs ?? SELF_UPDATE_INUSE_WAIT_MS);
  let waited = false;
  for (;;) {
    try {
      run();
      return { ok: true, waited };
    } catch (error) {
      if (!inUse(error)) return { ok: false, detail: `切换失败：${messageOf(error)}` };
      if (Date.parse(now()) >= deadline) {
        return {
          ok: false,
          detail: '更新需要先退出正在运行的 Desktop；等待超时仍未退出。请退出后再次点击「更新」。',
        };
      }
      waited = true;
      await sleep(deps.inUsePollMs ?? SELF_UPDATE_INUSE_POLL_MS);
    }
  }
}
