import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateJournalCarry, UpdateJournalLink, UpdateJournalRecord } from '@dsh-workbench/shared/host';
import type { SelfUpdateCarry } from './self-update-steps.js';
import { versionDirOf, type VersionLink } from './version-dir.js';
import { isRealDir } from './version-migrate.js';

export {
  recoverUpdateJournal as recoverVersionSwitch,
  restoreUpdateJournal as restoreVersionSwitch,
} from '@dsh-workbench/shared/host';
export type {
  UpdateJournalRecovery as VersionSwitchRecovery,
  UpdateJournalRecoveryInput as VersionSwitchRecoveryInput,
  UpdateJournalRestoreInput as VersionSwitchRestoreInput,
  UpdateJournalRestoreResult as VersionSwitchRestoreResult,
} from '@dsh-workbench/shared/host';

export interface VersionSwitchJournalInput {
  readonly profileDir: string;
  readonly versionsDir: string;
  readonly versionDir: string;
  readonly from: string;
  readonly to: string;
  readonly links: readonly VersionLink[];
  readonly carry?: SelfUpdateCarry | undefined;
  readonly at: string;
}

export function switchJournalOf(input: VersionSwitchJournalInput): UpdateJournalRecord {
  const manifestPath = join(input.profileDir, 'package.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifestDeps = manifestDepsOf(manifestText, input.links);
  const carry: UpdateJournalCarry[] = [];
  if (input.carry !== undefined && input.carry.version !== input.to) {
    const kept = versionDirOf(input.versionsDir, input.carry.version);
    for (const pkg of input.carry.packages) {
      const from = join(input.profileDir, 'node_modules', pkg);
      if (!isRealDir(from)) continue;
      carry.push({ pkg, from, to: join(kept, 'node_modules', pkg) });
    }
  }
  return {
    schema: 1,
    state: 'prepared',
    from: input.from,
    to: input.to,
    profileDir: input.profileDir,
    versionsDir: input.versionsDir,
    versionDir: input.versionDir,
    manifestPath,
    manifestText,
    manifestDeps,
    links: input.links.map(linkSnapshotOf),
    carry,
    cursor: 0,
    carried: 0,
    at: input.at,
  };
}

/**
 * 只记下这次会被接管的几条依赖原值；回滚时按 key 回写，
 * 不覆盖等待期间用户/插件新增的依赖。
 */
function manifestDepsOf(manifestText: string, links: readonly VersionLink[]): Readonly<Record<string, string | null>> {
  let dependencies: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(manifestText);
    if (typeof parsed === 'object' && parsed !== null) {
      const table = (parsed as Readonly<Record<string, unknown>>)['dependencies'];
      if (typeof table === 'object' && table !== null && !Array.isArray(table)) {
        dependencies = { ...(table as Readonly<Record<string, unknown>>) };
      }
    }
  } catch {
    // 清单坏了就别改它；记录成空对象，回滚时不碰依赖
  }
  const deps: Record<string, string | null> = {};
  for (const link of links) {
    const spec = dependencies[link.pkg];
    deps[link.pkg] = typeof spec === 'string' ? spec : null;
  }
  return deps;
}

function linkSnapshotOf(link: VersionLink): UpdateJournalLink {
  try {
    const info = lstatSync(link.link);
    if (info.isSymbolicLink()) {
      return { pkg: link.pkg, path: link.link, kind: 'symlink', target: readlinkSync(link.link) };
    }
    if (info.isDirectory()) return { pkg: link.pkg, path: link.link, kind: 'dir' };
    return { pkg: link.pkg, path: link.link, kind: 'other' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { pkg: link.pkg, path: link.link, kind: 'missing' };
    throw error;
  }
}
