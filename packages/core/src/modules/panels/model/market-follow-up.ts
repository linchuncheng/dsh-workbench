import { join } from 'node:path';
import { PLUGIN_ID } from '@dsh-workbench/shared/host';
import type { ProfilePackage, Seam } from '@dsh-workbench/shared/host';
import {
  migrateWorkbench,
  type MigrationRunInput,
  type MigrationRunResult,
} from '@/shared/api/host/migrate-workbench';
import { dismissFollowUp } from '@/shared/api/host/follow-up-dismiss';

const MIGRATION_TIMEOUT_MS = 120_000;

export interface WorkbenchFollowUpDeps {
  readonly dshHome: (() => string) | undefined;
  readonly profileName: (() => string | null) | undefined;
  readonly workbench: ((pkg: string) => ProfilePackage | undefined) | undefined;
  readonly seam?: Seam | undefined;
  readonly runMigration?: ((input: MigrationRunInput) => Promise<MigrationRunResult>) | undefined;
}

export interface WorkbenchFollowUpActions {
  migrateWorkbench(): Promise<{ readonly added: number; readonly files: number }>;
  dismissFollowUp(id: string): Promise<void>;
}

export function createWorkbenchFollowUps(deps: WorkbenchFollowUpDeps): WorkbenchFollowUpActions {
  const runMigration =
    deps.runMigration ??
    (async (input: MigrationRunInput): Promise<MigrationRunResult> => {
      const seam = deps.seam;
      if (seam === undefined) throw new Error('本机没有 shell 服务，无法执行迁移。');
      const outcome = await seam.run({
        argv: [process.execPath, input.script, '--migrate', '--force'],
        intent: { kind: 'host' },
        env: { ELECTRON_RUN_AS_NODE: '1', ...input.env },
        timeoutMs: MIGRATION_TIMEOUT_MS,
      });
      return { exitCode: outcome.exitCode ?? 1, stdout: outcome.stdout, stderr: outcome.stderr };
    });

  function homeAndProfile(): { readonly home: string; readonly profile: string } {
    if (deps.dshHome === undefined || deps.profileName === undefined) {
      throw new Error('读不到 DSH_HOME 或工作台配置名称，无法执行这一步。');
    }
    const home = deps.dshHome();
    const profile = deps.profileName();
    if (profile === null || profile === '') throw new Error('读不到工作台配置名称，无法执行这一步。');
    return { home, profile };
  }

  return {
    async migrateWorkbench() {
      const { home, profile } = homeAndProfile();
      const read = deps.workbench?.(PLUGIN_ID);
      if (read === undefined) throw new Error(`读不到这份工作台配置中安装的 ${PLUGIN_ID}，无法迁移。`);
      return migrateWorkbench({ home, profile, pkg: read.pkg, run: runMigration });
    },

    async dismissFollowUp(id) {
      const { home, profile } = homeAndProfile();
      dismissFollowUp(process.env.DSH_WORKBENCH_HOME ?? join(home, profile), id);
    },
  };
}
