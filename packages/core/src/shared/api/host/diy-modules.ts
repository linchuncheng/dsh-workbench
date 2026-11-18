import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { workspaceDeclarationIn, workspaceDirsOf } from '@dsh-workbench/shared/host';

export interface DiyModule {
  readonly unit: string;
  readonly name: string;
  readonly description: string;
  readonly dir: string;
  readonly installed: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function insideRoot(root: string, target: string): boolean {
  const base = existsSync(root) ? realpathSync(root) : resolve(root);
  const real = existsSync(target) ? realpathSync(target) : resolve(target);
  const rel = relative(base, real);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function manifestAt(dir: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

export type WorkspaceShape = 'workspace' | 'package' | 'bare';

export function shapeOf(root: string): WorkspaceShape {
  if (workspaceDeclarationIn(root).patterns.length > 0) return 'workspace';
  return manifestAt(root) === undefined ? 'bare' : 'package';
}

export function modulesIn(root: string, installed: readonly string[] = []): readonly DiyModule[] {
  const already = new Set(installed);
  const dirs = new Set<string>([root, ...workspaceDirsOf(root, workspaceDeclarationIn(root).patterns)]);
  const rows: DiyModule[] = [];
  for (const dir of dirs) {
    let manifest: unknown;
    try {
      manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    const record = asRecord(manifest);
    if (record === undefined) continue;
    const declared = asRecord(asRecord(record['dsh'])?.['workbench']);
    const unit = declared === undefined ? '' : asText(declared['unit']);
    if (unit === '') continue;
    rows.push({
      unit,
      name: asText(record['name']),
      description: asText(record['description']),
      dir,
      installed: already.has(unit),
    });
  }
  return rows.sort((left, right) => left.unit.localeCompare(right.unit));
}

export function readDesignOfModule(dir: string): unknown {
  const file = join(dir, 'design.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export interface SyncState {
  readonly state: 'ok' | 'syncing' | 'failed';
  readonly version: string;
  readonly at: string;
  readonly reason?: string;
}

export function syncStateOf(workspaceRoot: string): SyncState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(workspaceRoot, '.sync.json'), 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  const state = asText(record['state']);
  if (state !== 'ok' && state !== 'syncing' && state !== 'failed') return undefined;
  const reason = asText(record['reason']);
  return {
    state,
    version: asText(record['version']),
    at: asText(record['at']),
    ...(reason === '' ? {} : { reason }),
  };
}

export interface Toolchain {
  readonly core: string;
  readonly moduleTools: string;
  readonly shared: string;
}

export function toolchainOf(workspaceRoot: string): Toolchain | undefined {
  const versionOf = (name: string): string => {
    try {
      const parsed = JSON.parse(
        readFileSync(join(workspaceRoot, 'node_modules', '@dsh-workbench', name, 'package.json'), 'utf8'),
      ) as { readonly version?: unknown };
      return asText(parsed.version);
    } catch {
      return '';
    }
  };
  const core = versionOf('core');
  const moduleTools = versionOf('module-tools');
  const shared = versionOf('shared');
  if (core === '' || moduleTools === '' || shared === '') return undefined;
  return { core, moduleTools, shared };
}
