import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { linkDir, writeJsonFile, writeTextFile } from '../runtime/fs-write.js';

const SCOPE = '@dsh-workbench';
const LINK_PREFIX = 'link:';
const LOCK_FILES = ['pnpm-lock.yaml', join('node_modules', '.pnpm', 'lock.yaml')];

export interface WorkbenchLinkReconcileInput {
  readonly profileDir: string;
  readonly versionDir: string;
}

export interface WorkbenchLinkReconcileResult {
  readonly changed: readonly string[];
  readonly unsupported: readonly string[];
}

/**
 * 把 profile 里的工作台那一族链接对齐到某一代版本：清单、pnpm 锁、node_modules 三处一起改。
 *
 * pnpm 不会替我们纠正 `link:` 依赖的锁记录 —— 清单指向新的一代、锁还写着旧的一代时，它按锁安装，
 * 于是下一次在 profile 里装模块就会把工作台连回旧版本。这里补的正是那一步。
 * @param input `profileDir` 是工作台配置目录，`versionDir` 是要对齐到的 `versions/<版本>` 目录。
 * @returns 被改动的包名，以及 node_modules 里不是软链、改不动的包名。
 */
export function reconcileWorkbenchLinks(input: WorkbenchLinkReconcileInput): WorkbenchLinkReconcileResult {
  const packages = managedPackagesOf(input.versionDir);
  if (packages.length === 0) return { changed: [], unsupported: [] };
  const fixed: string[] = [];
  const unsupported: string[] = [];
  for (const pkg of packages) {
    const link = join(input.profileDir, 'node_modules', pkg);
    let entry: ReturnType<typeof lstatSync> | undefined;
    try {
      entry = lstatSync(link);
    } catch {
      entry = undefined;
    }
    if (entry !== undefined && !entry.isSymbolicLink()) {
      unsupported.push(pkg);
      continue;
    }
    fixed.push(pkg);
  }
  const specs = new Map(
    fixed.map((pkg) => [pkg, linkSpecOf(input.profileDir, input.versionDir, pkg)] as const),
  );
  const changed = new Set<string>();
  for (const pkg of rewriteManifest(input.profileDir, specs)) changed.add(pkg);
  for (const file of LOCK_FILES) {
    for (const pkg of rewriteLock(join(input.profileDir, file), specs)) changed.add(pkg);
  }
  for (const pkg of relinkPackages(input.profileDir, input.versionDir, fixed)) changed.add(pkg);
  return { changed: [...changed].sort(), unsupported: unsupported.sort() };
}

function managedPackagesOf(versionDir: string): readonly string[] {
  const root = join(versionDir, 'node_modules', SCOPE);
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .filter((entry) => existsSync(join(root, entry.name, 'package.json')))
      .map((entry) => `${SCOPE}/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

function linkSpecOf(profileDir: string, versionDir: string, pkg: string): string {
  const target = join(versionDir, 'node_modules', pkg);
  return `${LINK_PREFIX}${relative(profileDir, target).split(sep).join('/')}`;
}

function manifestDependencies(profileDir: string): Record<string, string> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      readonly dependencies?: unknown;
    };
    const table = parsed.dependencies;
    if (typeof table !== 'object' || table === null || Array.isArray(table)) return undefined;
    return { ...(table as Record<string, string>) };
  } catch {
    return undefined;
  }
}

function rewriteManifest(profileDir: string, specs: ReadonlyMap<string, string>): readonly string[] {
  const dependencies = manifestDependencies(profileDir);
  if (dependencies === undefined) return [];
  const changed: string[] = [];
  for (const [pkg, spec] of specs) {
    if (!Object.hasOwn(dependencies, pkg)) continue;
    if (dependencies[pkg] === spec) continue;
    dependencies[pkg] = spec;
    changed.push(pkg);
  }
  if (changed.length === 0) return [];
  try {
    const parsed = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as Record<string, unknown>;
    writeJsonFile(join(profileDir, 'package.json'), { ...parsed, dependencies });
  } catch {
    return [];
  }
  return changed;
}

function packageOfLinkSpec(spec: string): string | undefined {
  const match = /\/@dsh-workbench\/([^/\s]+)\/?$/.exec(spec.trim());
  return match === null ? undefined : `${SCOPE}/${match[1]}`;
}

function rewriteLock(file: string, specs: ReadonlyMap<string, string>): readonly string[] {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const changed = new Set<string>();
  const lines = text.split('\n').map((line) => {
    const match = /^(\s+)(specifier|version): (link:\S+)$/.exec(line);
    if (match === null) return line;
    const [, indent, key, spec] = match;
    const pkg = packageOfLinkSpec(spec);
    if (pkg === undefined) return line;
    const desired = specs.get(pkg);
    if (desired === undefined || desired === spec) return line;
    changed.add(pkg);
    return `${indent}${key}: ${desired}`;
  });
  if (changed.size === 0) return [];
  try {
    writeTextFile(file, lines.join('\n'));
  } catch {
    return [];
  }
  return [...changed];
}

/**
 * 读一个软链指向哪：不是软链、或读不了时返回 `undefined`。
 * @param link 软链自己的路径。
 * @returns 解析后的绝对目标。
 */
export function resolveLinkTarget(link: string): string | undefined {
  try {
    if (!lstatSync(link).isSymbolicLink()) return undefined;
    return resolve(dirname(link), readlinkSync(link));
  } catch {
    return undefined;
  }
}

function relinkPackages(
  profileDir: string,
  versionDir: string,
  packages: readonly string[],
): readonly string[] {
  const changed: string[] = [];
  for (const pkg of packages) {
    const link = join(profileDir, 'node_modules', pkg);
    const target = join(versionDir, 'node_modules', pkg);
    let info: ReturnType<typeof lstatSync> | undefined;
    try {
      info = lstatSync(link);
    } catch {
      info = undefined;
    }
    if (info !== undefined && resolveLinkTarget(link) === resolve(target)) continue;
    try {
      linkDir(target, link);
      changed.push(pkg);
    } catch {
      continue;
    }
  }
  return changed;
}
