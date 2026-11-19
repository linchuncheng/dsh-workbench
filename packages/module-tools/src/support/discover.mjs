import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { workspaceDeclarationIn, workspaceDirsOf } from '@dsh-workbench/shared/host';

function manifestOf(dir) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function patternsOf(root) {
  const parsed = workspaceDeclarationIn(root);
  if (parsed.declared && parsed.patterns.length === 0 && parsed.empty !== true) {
    throw new Error(
      `pnpm-workspace.yaml 里有 packages 但没有解析出任何条目：${join(root, 'pnpm-workspace.yaml')} —— ` +
        '支持块列表、行内数组、花括号与 ! 排除；无法读取的写法会在这一步报出',
    );
  }
  return parsed;
}

export function workspaceRootOf(start) {
  if (process.env.DSH_WB_ROOT) return process.env.DSH_WB_ROOT;
  let dir = start;
  let legacy;
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const manifest = manifestOf(dir);
    if (manifest !== undefined) {
      const workspaces = manifest.workspaces;
      if (Array.isArray(workspaces) || (workspaces !== null && typeof workspaces === 'object')) return dir;
    }
    if (legacy === undefined && existsSync(join(dir, 'packages'))) legacy = dir;
    const parent = dirname(dir);
    if (parent === dir) return legacy ?? start;
    dir = parent;
  }
}

function isDir(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function childDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.name !== 'node_modules' && !entry.name.startsWith('.'))
      .map((entry) => join(dir, entry.name))
      .filter((child) => isDir(child));
  } catch {
    return [];
  }
}

const cache = new Map();

function legacyPackages(root) {
  return childDirs(join(root, 'packages'));
}

export function discoverPackages({ root = process.cwd() } = {}) {
  const workspace = workspaceRootOf(root);
  const parsed = patternsOf(workspace);
  const key = [workspace, root, parsed.patterns.join('|')].join('\0');
  const cached = cache.get(key);
  if (cached !== undefined) return cached.map((pkg) => ({ ...pkg }));

  const dirs = [];
  const push = (dir) => {
    if (existsSync(dir)) dirs.push(dir);
  };
  if (!parsed.declared) {
    for (const dir of legacyPackages(workspace)) push(dir);
  } else {
    for (const dir of workspaceDirsOf(workspace, parsed.patterns)) push(dir);
  }
  const isolated = process.env.DSH_WB_ROOT?.trim();
  const inside = isolated === undefined || isolated === '' || resolve(root).startsWith(resolve(workspace) + sep);
  if (inside) push(root);
  push(workspace);

  const seen = new Set();
  const found = [];
  for (const dir of dirs) {
    const resolved = existsSync(dir) ? realpathSync(dir) : dir;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const manifest = manifestOf(dir);
    if (manifest === undefined || typeof manifest.name !== 'string') continue;
    found.push({ dir, manifest });
  }
  cache.set(key, found);
  return found.map((pkg) => ({ ...pkg }));
}

export function discoverModulePackages(options = {}) {
  return discoverPackages(options).filter((pkg) => pkg.manifest.dsh?.workbench !== undefined);
}
