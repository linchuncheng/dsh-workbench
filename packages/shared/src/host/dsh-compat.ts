import { join } from 'node:path';
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
      readonly reason: 'no-requirement' | 'missing-dsh-version' | 'malformed';
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
  const version = input.dshVersion?.trim() ?? '';
  if (version === '' || semver.valid(version) === null) {
    return { verdict: 'unknown', reason: 'missing-dsh-version', requirements };
  }
  const unsatisfied: DshRequirement[] = [];
  let malformed = false;
  for (const requirement of requirements) {
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
  const own = readManifest(join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'))?.['version'];
  if (typeof own === 'string' && semver.valid(own) !== null) return own;
  const fromEnv = process.env['DSH_VERSION'];
  if (typeof fromEnv === 'string' && semver.valid(fromEnv.trim()) !== null) return fromEnv.trim();
  const anchor = readManifest(join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'package.json'));
  return dependencyVersionOf(anchor, '@deepseek-ai/dsh');
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
