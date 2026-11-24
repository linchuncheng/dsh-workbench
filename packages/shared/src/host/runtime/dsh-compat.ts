import { dirname, join } from 'node:path';
import semver from 'semver';
import { readJsonObject } from './read-json.js';

export type DshRequirementSource = 'engines' | 'peer';

export interface DshRequirement {
  readonly pkg: string;
  readonly range: string;
  readonly source: DshRequirementSource;
}

export interface DshManifestFields {
  readonly name?: string | undefined;
  readonly engines?: Readonly<Record<string, unknown>> | undefined;
  readonly peerDependencies?: Readonly<Record<string, unknown>> | undefined;
}

export type DshCompatibility =
  | { readonly verdict: 'compatible' }
  | { readonly verdict: 'incompatible'; readonly requirements: readonly DshRequirement[] }
  | {
      readonly verdict: 'unknown';
      readonly reason: 'no-requirement' | 'peer-only' | 'missing-dsh-version' | 'malformed';
      readonly requirements: readonly DshRequirement[];
    };

export function dshRequirementsOf(manifest: DshManifestFields): readonly DshRequirement[] {
  const pkg = typeof manifest.name === 'string' && manifest.name !== '' ? manifest.name : '(unknown)';
  const engines = manifest.engines ?? {};
  const engineRange = engines['dsh'];
  if (typeof engineRange === 'string' && engineRange.trim() !== '') {
    return [{ pkg, range: engineRange.trim(), source: 'engines' }];
  }
  const peers = manifest.peerDependencies ?? {};
  const found: DshRequirement[] = [];
  for (const [name, range] of Object.entries(peers)) {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue;
    if (typeof range !== 'string' || range.trim() === '') continue;
    found.push({ pkg, range: range.trim(), source: 'peer' });
  }
  return found;
}

export function dshCompatibilityOf(input: {
  readonly requirements: readonly DshRequirement[];
  readonly dshVersion?: string | undefined;
}): DshCompatibility {
  const requirements = input.requirements;
  if (requirements.length === 0) return { verdict: 'unknown', reason: 'no-requirement', requirements };
  const engines = requirements.filter((item) => item.source === 'engines');
  if (engines.length === 0) return { verdict: 'unknown', reason: 'peer-only', requirements };
  const version = input.dshVersion?.trim() ?? '';
  if (version === '' || semver.valid(version) === null) {
    return { verdict: 'unknown', reason: 'missing-dsh-version', requirements };
  }
  const unsatisfied: DshRequirement[] = [];
  let malformed = false;
  for (const requirement of engines) {
    const range = semver.validRange(requirement.range);
    if (range === null) {
      malformed = true;
      continue;
    }
    if (!semver.satisfies(version, range, { includePrerelease: true })) unsatisfied.push(requirement);
  }
  if (unsatisfied.length > 0) return { verdict: 'incompatible', requirements: unsatisfied };
  if (malformed) return { verdict: 'unknown', reason: 'malformed', requirements };
  return { verdict: 'compatible' };
}

export function dshVersionIn(profileDir: string): string | undefined {
  return dshVersionFrom(profileDir)?.version;
}

export function dshVersionFrom(
  profileDir: string,
): { readonly version: string; readonly from: string } | undefined {
  const fromClient = envVersionOf('DSH_CLIENT_VERSION');
  if (fromClient !== undefined) return { version: fromClient, from: 'DSH_CLIENT_VERSION' };

  const dirs = searchDirsOf(profileDir);
  const installed = firstOver(dirs, (dir) => {
    const file = join(dir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
    const own = readManifest(file)?.['version'];
    return typeof own === 'string' && semver.valid(own) !== null ? { version: own, from: file } : undefined;
  });
  if (installed !== undefined) return installed;

  const fromEnv = envVersionOf('DSH_VERSION');
  if (fromEnv !== undefined) return { version: fromEnv, from: 'DSH_VERSION' };

  return firstOver(dirs, (dir) => {
    const file = join(dir, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'package.json');
    const version = dependencyVersionOf(readManifest(file), '@deepseek-ai/dsh');
    return version === undefined ? undefined : { version, from: `${file} → @deepseek-ai/dsh` };
  });
}

function envVersionOf(name: string): string | undefined {
  const raw = process.env[name];
  return typeof raw === 'string' && semver.valid(raw.trim()) !== null ? raw.trim() : undefined;
}

function firstOver<T>(dirs: readonly string[], read: (dir: string) => T | undefined): T | undefined {
  for (const dir of dirs) {
    const got = read(dir);
    if (got !== undefined) return got;
  }
  return undefined;
}

function searchDirsOf(profileDir: string): readonly string[] {
  const parent = dirname(profileDir);
  return parent === profileDir ? [profileDir] : [profileDir, parent];
}

function dependencyVersionOf(
  manifest: Readonly<Record<string, unknown>> | undefined,
  name: string,
): string | undefined {
  if (manifest === undefined) return undefined;
  for (const key of ['dependencies', 'peerDependencies']) {
    const table = manifest[key];
    if (typeof table !== 'object' || table === null) continue;
    const range = (table as Readonly<Record<string, unknown>>)[name];
    if (typeof range !== 'string' || range.trim() === '') continue;
    const exact = semver.valid(range.trim());
    if (exact !== null) return exact;
  }
  return undefined;
}

function readManifest(file: string): Readonly<Record<string, unknown>> | undefined {
  return readJsonObject(file);
}
