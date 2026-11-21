import fs from 'node:fs';
import path from 'node:path';
import type { DshHostContext } from '../../api/dsh.js';
import { asRecord } from '../../contract/guards.js';
import { declarationProblemsOf, readDeclaration } from '../../contract/unit-declaration.js';
import { packageSourceOf } from './installed-sources.js';
import { lockEntryMapOf, type LockEntry } from './pnpm-lock.js';
import { npmrcEntries } from './npmrc.js';
import { scopeOf } from '../adapters/adapter-types.js';
import { workbenchRoot } from '../data/data-root.js';
import { isPackageName } from '../data/spec.js';
import type { InstalledModule, ProfileModule, ProfilePackage } from '../adapters/adapter-types.js';
export interface UnitDeclarationSource {
  readonly pkg: string;
  readonly declaration: unknown;
  readonly description?: string;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function profileDirOf(ctx: DshHostContext): string | null {
  const profile = ctx.get('profileContext');
  const dir = typeof profile?.dir === 'string' ? profile.dir.trim() : '';
  return dir === '' ? null : dir;
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function profileManifestOf(profileDir: string | null): Readonly<Record<string, unknown>> | undefined {
  if (profileDir === null) return undefined;
  try {
    return asRecord(JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')));
  } catch {
    return undefined;
  }
}

export function declaresPackage(profileDir: string | null, pkg: string): boolean {
  const manifest = profileManifestOf(profileDir);
  if (manifest === undefined) return false;
  if (typeof asRecord(manifest.dependencies)?.[pkg] === 'string') return true;
  const bundles = asRecord(asRecord(manifest.dsh)?.profile)?.bundles;
  return Array.isArray(bundles) && bundles.includes(pkg);
}

function declaresBundle(profileDir: string, pkg: string): boolean {
  try {
    const record = asRecord(JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8')));
    const dsh = asRecord(record?.['dsh']);
    return dsh !== undefined && 'bundle' in dsh;
  } catch {
    return false;
  }
}

function declaredNamesOf(record: Readonly<Record<string, unknown>>): string[] {
  const bundles = stringsOf(asRecord(asRecord(record.dsh)?.profile)?.bundles);
  const dependencies = asRecord(record.dependencies) ?? {};
  return [...new Set([...bundles, ...Object.keys(dependencies)])];
}

export function profileModules(profileDir: string | null): readonly ProfileModule[] {
  const record = profileManifestOf(profileDir);
  if (record === undefined || profileDir === null) return [];
  const dependencies = asRecord(record.dependencies) ?? {};
  const names = declaredNamesOf(record);
  const found: ProfileModule[] = [];
  const lock = lockLookupOf(profileDir);
  for (const pkg of names) {
    const read = readInstalledModule(profileDir, pkg, lock);
    if (read.kind === 'module') {
      const spec = asText(dependencies[read.pkg]);
      found.push({
        pkg: read.pkg,
        unit: read.unit,
        version: read.version,
        ...(read.registry === undefined ? {} : { registry: read.registry }),
        local: isLocalCopySpec(profileDir, spec),
        fromRegistry: isRegistryDependencySpec(spec),
        ...(declaresBundle(profileDir, read.pkg) ? { shipsBundle: true } : {}),
      });
    }
  }
  return found;
}

export function createDeclarationLookup(
  profileDir: string | null,
): (unit: string) => UnitDeclarationSource | undefined {
  let roster: Map<string, string> | undefined;
  const scan = (): Map<string, string> =>
    new Map(profileModules(profileDir).map((row) => [row.unit, row.pkg]));
  return (unit) => {
    roster ??= scan();
    let pkg = roster.get(unit);
    if (pkg === undefined) {
      roster = scan();
      pkg = roster.get(unit);
    }
    if (pkg === undefined) return undefined;
    const description = moduleDescriptionOf(profileDir, pkg);
    return {
      pkg,
      declaration: moduleDeclarationOf(profileDir, pkg),
      ...(description === undefined ? {} : { description }),
    };
  };
}

function lockLookupOf(profileDir: string | null): ReadonlyMap<string, LockEntry> | undefined {
  if (profileDir === null) return undefined;
  try {
    return lockEntryMapOf(fs.readFileSync(path.join(profileDir, 'pnpm-lock.yaml'), 'utf8'));
  } catch {
    return undefined;
  }
}

function unquoted(value: string): string {
  const quote = value.charAt(0);
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function registryFromNpmrc(profileDir: string, pkg: string): string | undefined {
  let text: string;
  try {
    text = fs.readFileSync(path.join(profileDir, '.npmrc'), 'utf8');
  } catch {
    return undefined;
  }
  const scope = scopeOf(pkg);
  let fallback: string | undefined;
  for (const entry of npmrcEntries(text)) {
    if (scope !== null && entry.key === `${scope}:registry`) return unquoted(entry.value);
    if (entry.key === 'registry') fallback = unquoted(entry.value);
  }
  return fallback;
}

function registryOf(
  profileDir: string,
  pkg: string,
  manifest: Readonly<Record<string, unknown>>,
  lock?: ReadonlyMap<string, LockEntry> | undefined,
): string | undefined {
  const declared = asText(asRecord(manifest.publishConfig)?.registry);
  if (declared !== '') return declared;
  const recorded = packageSourceOf(profileDir, pkg);
  if (recorded !== undefined) return recorded.registry;
  const locked = (lock ?? lockLookupOf(profileDir))?.get(pkg)?.registry;
  return locked === undefined ? registryFromNpmrc(profileDir, pkg) : locked;
}

export function moduleDeclarationOf(profileDir: string | null, pkg: string): unknown {
  if (profileDir === null || !isPackageName(pkg)) return undefined;
  try {
    const text = fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8');
    return asRecord(asRecord(asRecord(JSON.parse(text))?.dsh)?.workbench);
  } catch {
    return undefined;
  }
}

export function moduleDescriptionOf(profileDir: string | null, pkg: string): string | undefined {
  if (profileDir === null || !isPackageName(pkg)) return undefined;
  try {
    const text = fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8');
    const description = asText(asRecord(JSON.parse(text))?.description).trim();
    return description === '' ? undefined : description;
  } catch {
    return undefined;
  }
}

export interface DeclarationGap {
  readonly pkg: string;
  readonly problems: readonly string[];
}

export function declarationGaps(profileDir: string | null): readonly DeclarationGap[] | undefined {
  if (profileManifestOf(profileDir) === undefined) return undefined;
  const gaps: DeclarationGap[] = [];
  for (const module of profileModules(profileDir)) {
    const problems = declarationProblemsOf(module.pkg, moduleDeclarationOf(profileDir, module.pkg));
    if (problems.length > 0) gaps.push({ pkg: module.pkg, problems });
  }
  return gaps;
}

export function declaredPluginCommands(profileDir: string | null): ReadonlyMap<string, ReadonlySet<string>> {
  const declared = new Map<string, Set<string>>();
  for (const module of profileModules(profileDir)) {
    const read = readDeclaration(module.pkg, moduleDeclarationOf(profileDir, module.pkg));
    for (const need of read.manifest?.needs ?? []) {
      if (need.kind !== 'extension') continue;
      const name = need.name.trim();
      if (name === '') continue;
      const commands = declared.get(name) ?? new Set<string>();
      for (const command of need.commands ?? []) commands.add(command);
      declared.set(name, commands);
    }
  }
  return declared;
}

export function readInstalledModule(
  profileDir: string | null,
  pkg: string,
  lock?: ReadonlyMap<string, LockEntry> | undefined,
): InstalledModule {
  if (profileDir === null || !isPackageName(pkg)) return { kind: 'unknown', pkg };
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8'));
  } catch (error) {
    return { kind: 'unknown', pkg, reason: readFailureOf(error) };
  }
  const record = asRecord(manifest);
  if (record === undefined) return { kind: 'unknown', pkg, reason: 'package.json 不是一份对象' };
  const declared = asRecord(asRecord(record.dsh)?.workbench);
  const unit = declared === undefined ? '' : asText(declared.unit);
  if (unit === '') return { kind: 'not-module', pkg };
  const registry = registryOf(profileDir, pkg, record, lock);
  return {
    kind: 'module',
    pkg,
    unit,
    version: asText(record.version),
    ...(registry === undefined ? {} : { registry }),
  };
}

function readFailureOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === 'ENOENT') return '没装上（读不到 package.json）';
  if (code === 'EACCES' || code === 'EPERM') return '没有权限读 package.json';
  return error instanceof Error ? error.message : String(error);
}

export interface UnreadableModule {
  readonly pkg: string;
  readonly reason: string;
}

export function unreadableModules(profileDir: string | null): readonly UnreadableModule[] {
  const record = profileManifestOf(profileDir);
  if (record === undefined || profileDir === null) return [];
  const declared = new Set(Object.keys(asRecord(record.dependencies) ?? {}));
  const found: UnreadableModule[] = [];
  for (const pkg of declaredNamesOf(record)) {
    if (!isPackageName(pkg) || !declared.has(pkg)) continue;
    const read = readInstalledModule(profileDir, pkg);
    if (read.kind === 'unknown') found.push({ pkg, reason: read.reason ?? '读不出来' });
  }
  return found;
}

const PACKED_ARTIFACT = /\.(?:tgz|tar\.gz|tar)$/i;

export function isPackedArtifactSpec(spec: string): boolean {
  const trimmed = spec.trim();
  const pkgPath = trimmed.startsWith('file:') ? trimmed.slice('file:'.length) : trimmed;
  return PACKED_ARTIFACT.test(pkgPath);
}

export function isLocalDependencySpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (isPackedArtifactSpec(trimmed)) return false;
  return (
    trimmed.startsWith('link:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/')
  );
}

const LINK_SPEC_PREFIX = 'link:';

export function isManagedLinkSpec(spec: string, versionsDir: string, baseDir: string): boolean {
  const trimmed = spec.trim();
  if (!trimmed.startsWith(LINK_SPEC_PREFIX)) return false;
  const target = path.resolve(baseDir, trimmed.slice(LINK_SPEC_PREFIX.length));
  const root = path.resolve(versionsDir);
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function isLocalCopySpec(profileDir: string | null, spec: string): boolean {
  const local = isLocalDependencySpec(spec);
  if (!local || profileDir === null) return local;
  return !isManagedLinkSpec(spec, path.join(workbenchRoot(), 'versions'), profileDir);
}

const NON_REGISTRY_SPEC = /^(?:git\+|git:|github:|gitlab:|bitbucket:|https?:|ssh:|workspace:)/i;

export function isRegistryDependencySpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (trimmed === '') return true;
  if (isLocalDependencySpec(trimmed) || isPackedArtifactSpec(trimmed)) return false;
  return !NON_REGISTRY_SPEC.test(trimmed);
}

export function readProfilePackage(profileDir: string | null, pkg: string): ProfilePackage | undefined {
  if (profileDir === null || !isPackageName(pkg)) return undefined;
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', pkg, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const record = asRecord(manifest);
  if (record === undefined) return undefined;
  const version = asText(record.version);
  if (version === '') return undefined;
  const registry = registryOf(profileDir, pkg, record);
  const dependencies = asRecord(profileManifestOf(profileDir)?.dependencies) ?? {};
  const local = isLocalCopySpec(profileDir, asText(dependencies[pkg]));
  return {
    pkg,
    version,
    ...(registry === undefined ? {} : { registry }),
    ...(local ? { local: true } : {}),
  };
}

export function packageVersionAt(packageRoot: string): string | undefined {
  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const version = asText(asRecord(manifest)?.version);
  return version === '' ? undefined : version;
}
