import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DshHostContext, DshWorkspaceRecord, DshWorkspaceRegistry } from '@dsh-workbench/shared/host';

export interface SessionWorkspace {
  readonly root: string;
  readonly title: string;
}

async function resolveAt(registry: DshWorkspaceRegistry, dir: string): Promise<DshWorkspaceRecord | undefined> {
  try {
    return await registry.resolveByPath(dir);
  } catch {
    return undefined;
  }
}

function parentsOf(workspace: string | null | undefined): readonly string[] {
  const start = typeof workspace === 'string' ? workspace.trim() : '';
  if (start === '') return [];
  const dirs: string[] = [];
  let dir = start.replace(/[\\/]+$/u, '');
  if (dir === '') dir = start;
  for (;;) {
    dirs.push(dir);
    const parent = dirname(dir);
    if (parent === dir) return dirs;
    dir = parent;
  }
}

export async function sessionWorkspaceOf(
  ctx: DshHostContext,
  workspace: string | null,
): Promise<SessionWorkspace | null> {
  const registry = ctx.get('workspaceRegistry');
  if (registry === undefined) return null;
  for (const dir of parentsOf(workspace)) {
    const hit = await resolveAt(registry, dir);
    if (hit !== undefined) return { root: hit.path, title: hit.title };
  }
  return null;
}

function knownPathsOf(registry: DshWorkspaceRegistry): ReadonlySet<string> | null {
  try {
    return new Set(registry.list().map((one) => one.path));
  } catch {
    return null;
  }
}

function canonicalOf(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return dir;
  }
}

export function registeredWorkspacePathOf(
  ctx: DshHostContext,
  workspace: string | null | undefined,
): string | null {
  const dirs = parentsOf(workspace);
  if (dirs.length === 0) return null;
  const registry = ctx.get('workspaceRegistry');
  if (registry === undefined) return null;
  const known = knownPathsOf(registry);
  if (known === null) return null;
  for (const dir of dirs) {
    if (known.has(dir)) return dir;
    const canonical = canonicalOf(dir);
    if (known.has(canonical)) return canonical;
  }
  return null;
}
