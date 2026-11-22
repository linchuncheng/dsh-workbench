import type { AdapterSet, DshHostContext } from '@dsh-workbench/shared/host';
import type { ModulePort } from '@dsh-workbench/shared/host';
import {
  ensureReleaseAge,
  nowIso,
  recoverUpdateJournal,
  runningVersionOf,
  updateJournalFile,
  workbenchBootFile,
  workbenchRoot,
  workbenchSelfUpdateMarker,
  workbenchUpFile,
  writeBootRecord,
} from '@dsh-workbench/shared/host';
import { resumeQueuedSelfUpdate } from './self-update-resume';
import { settlePendingSelfUpdate } from './self-update-settle';
import { warn } from './host-args';
import { syncModuleRows } from './module-rows-sync';

export interface BootNoteInput {
  readonly version?: string | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export interface BootChoresInput extends BootNoteInput {
  readonly ctx: DshHostContext;
  readonly supply: Pick<ModulePort, 'startSelfUpdate' | 'profileModules'> | undefined;
  readonly home: string;
  readonly profileDir: string | null;
}

export function noteBoot(input: BootNoteInput = {}): string | undefined {
  const version = input.version ?? runningVersionOf(import.meta.url);
  if (version !== undefined) {
    try {
      writeBootRecord({ version, at: nowIso(), pid: process.pid }, workbenchBootFile());
    } catch (error) {
      input.log?.(`启动记录没写成：${textOf(error)}`);
    }
    try {
      if (settlePendingSelfUpdate(version)) input.log?.(`自更新已生效：${version}`);
    } catch (error) {
      input.log?.(`待重启收尾没做成：${textOf(error)}`);
    }
  }
  try {
    recoverUpdateJournal({
      file: updateJournalFile(workbenchRoot()),
      bootFile: workbenchBootFile(),
      upFile: workbenchUpFile(),
      markerPath: workbenchSelfUpdateMarker(),
      ...(input.log === undefined ? {} : { log: input.log }),
    });
  } catch (error) {
    input.log?.(`换版日志没处理成：${textOf(error)}`);
  }
  return version;
}

export function bootChores(input: BootChoresInput): string | undefined {
  const version = noteBoot(input);
  if (version !== undefined && input.profileDir !== null) {
    try {
      ensureReleaseAge({ dir: input.profileDir });
    } catch (error) {
      input.log?.(`放行发布龄没做成：${textOf(error)}`);
    }
    if (input.supply !== undefined) {
      try {
        const sync = syncModuleRows({ profileDir: input.profileDir, modules: input.supply.profileModules(input.profileDir) });
        if (sync.added.length > 0 || sync.removed.length > 0) {
          input.log?.(
            `[dsh-workbench] 模块行已同步：添加 ${sync.added.join('、') || '无'}；移除 ${sync.removed.join('、') || '无'}`,
          );
        }
        if (sync.legacy.length > 0) {
          input.log?.(
            `[dsh-workbench] ${sync.legacy.join('、')} 仍声明着 dsh.bundle（旧包兼容，按组合包装载）：请重新发布一版去掉这个字段；下次启动会自动改走模块行`,
          );
        }
        if (sync.stuck.length > 0) {
          input.log?.(
            `[dsh-workbench] ${sync.stuck.join('、')} 还声明着 dsh.bundle，没有为它写模块行：请先在模块自己的仓库里去掉这个字段并重新发布，再迁移`,
          );
        }
      } catch (error) {
        input.log?.(`模块行没有同步：${textOf(error)}`);
      }
    }
  }
  try {
    resumeQueuedSelfUpdate(input.ctx, { supply: input.supply, home: input.home, profileDir: input.profileDir });
  } catch (error) {
    input.log?.(`未完成的更新未能接续：${textOf(error)}`);
  }
  return version;
}

export function seedRuntime(ctx: DshHostContext, adapters: AdapterSet, corePackageUrl: string): void {
  try {
    adapters.runtime.seed(ctx, { corePackageUrl, log: (message) => warn(ctx, message) });
  } catch (error) {
    warn(ctx, `运行时自举没做成：${textOf(error)}`);
  }
}

function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
