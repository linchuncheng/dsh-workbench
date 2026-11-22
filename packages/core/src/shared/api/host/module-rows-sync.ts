import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  moduleRowsFrom,
  moduleRowsIn,
  profileBundlesOf,
  withModuleRows,
  writePatchFile,
  type ModuleRow,
  type ProfileModule,
} from '@dsh-workbench/shared/host';

export interface SyncModuleRowsInput {
  readonly profileDir: string | null;
  readonly modules: readonly ProfileModule[];
}

export interface SyncModuleRowsResult {
  readonly changed: boolean;
  readonly rows: readonly ModuleRow[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly stuck: readonly string[];
  readonly legacy: readonly string[];
}

export function syncModuleRows(input: SyncModuleRowsInput): SyncModuleRowsResult {
  if (input.profileDir === null) {
    return { changed: false, rows: [], added: [], removed: [], stuck: [], legacy: [] };
  }
  const path = join(input.profileDir, 'cordis.patch.yml');
  const present = existsSync(path);
  const text = present ? readFileSync(path, 'utf8') : '';
  const before = present ? moduleRowsIn(text) : [];
  const bundles = profileBundlesOf(input.profileDir);
  const desired = moduleRowsFrom(
    input.modules.map((module) => ({
      unit: module.unit,
      pkg: module.pkg,
      ...(module.shipsBundle === true && bundles.includes(module.pkg) ? { shipsBundle: true } : {}),
    })),
  );
  const rowsFor = new Set(desired.map((row) => row.name));
  const stuck = input.modules
    .filter((module) => !rowsFor.has(module.pkg) && !bundles.includes(module.pkg))
    .map((module) => module.pkg);
  const legacy = input.modules
    .filter((module) => module.shipsBundle === true && bundles.includes(module.pkg))
    .map((module) => module.pkg);
  const next = withModuleRows(text, desired);
  const changed = next !== text;
  if (changed) writePatchFile(path, next);
  const rows = present && !changed ? before : moduleRowsIn(next);
  const beforeIds = new Set(before.map((row) => row.id));
  const afterIds = new Set(rows.map((row) => row.id));
  return {
    changed,
    rows,
    added: [...afterIds].filter((id) => !beforeIds.has(id)),
    removed: [...beforeIds].filter((id) => !afterIds.has(id)),
    stuck,
    legacy,
  };
}

export type ModuleRowsHealth = { readonly ok: true } | { readonly ok: false; readonly problem: string };

export function diagnoseModuleRows(profileDir: string | null): ModuleRowsHealth {
  if (profileDir === null) return { ok: true };
  const path = join(profileDir, 'cordis.patch.yml');
  if (!existsSync(path)) return { ok: true };
  try {
    moduleRowsIn(readFileSync(path, 'utf8'));
    return { ok: true };
  } catch (error) {
    return { ok: false, problem: error instanceof Error ? error.message : String(error) };
  }
}
