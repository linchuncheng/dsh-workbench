import { now } from '../runtime/time.js';
import type { Seam } from '../seam/run.js';
import { productWrite } from '../seam/intent.js';
import type { PluginRelease } from '../../contract/unit.js';

import { RELEASE_PACKAGES } from './release-packages.generated.js';
import {
  LEDGER_READ_TIMEOUT_MS,
  VERSION_CHECK_FAILURE_TTL_MS,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '../../config/constants.js';
import { compareVersions, isBetaVersion, isValidVersion } from '../runtime/version.js';
import { parseJsonLoose } from '../../lib/text.js';
import { quoteShellArg } from '../shell/shell-text.js';

function cacheFlag(cacheDir: string | undefined): string {
  return cacheDir === undefined ? '' : ` --cache ${quoteShellArg(cacheDir)}`;
}

export function parseLedgerVersion(
  stdout: string,
  name: string,
): string | undefined {
  const parsed = parseJsonLoose(stdout);
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const entry = (parsed as { dependencies?: Record<string, unknown> })
    .dependencies?.[name];
  if (typeof entry !== "object" || entry === null) return undefined;
  const version = (entry as { version?: unknown }).version;
  return typeof version === "string" && isValidVersion(version.trim())
    ? version.trim()
    : undefined;
}

function parseVersion(stdout: string): string | undefined {
  const value = stdout.trim();
  return isValidVersion(value) ? value : undefined;
}

export function candidatesOf(stdout: string, includePrerelease: boolean): readonly string[] {
  if (!includePrerelease) {
    const one = parseVersion(stdout);
    return one === undefined ? [] : [one];
  }
  const parsed = parseJsonLoose(stdout);
  const list = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : [];
  return list
    .filter((value): value is string => typeof value === 'string' && isValidVersion(value))
    .map((value) => value.trim())
    .filter((value) => !isBetaVersion(value))
    .sort((left, right) => (compareVersions(right, left) ?? 0));
}

interface CacheEntry {
  readonly at: number;
  readonly value: string | undefined;
}

async function viewOnce(
  seam: Seam,
  commands: readonly string[],
): Promise<{ readonly ok: boolean; readonly stdout: string }> {
  for (const command of commands) {
    const result = await seam
      .run({
        command,
        intent: productWrite(),
        retry: 'safe',
        timeoutMs: VERSION_CHECK_TIMEOUT_MS,
        bestEffort: true,
      })
      .catch(() => undefined);
    const stdout = result?.exitCode === 0 ? result.stdout.trim() : '';
    if (stdout !== '') return { ok: true, stdout };
  }
  return { ok: false, stdout: '' };
}

function versionCacheTtl(value: string | undefined): number {
  return value === undefined ? VERSION_CHECK_FAILURE_TTL_MS : VERSION_CHECK_TTL_MS;
}


export interface ReleaseProbe {
  latestVersion(options: LatestVersionOptions): Promise<string | undefined>;
  missingReleaseParts(options: MissingPartsOptions): Promise<readonly string[]>;
  probeRelease(options: ProbeReleaseOptions): Promise<PluginRelease | undefined>;
  reset(): void;
}

export function createReleaseProbe(input: { readonly head?: TarballHead | undefined } = {}): ReleaseProbe {
  const latestCache = new Map<string, CacheEntry>();
  const existsCache = new Map<string, ExistsEntry>();
  const head = input.head ?? defaultHead;
  const ready = (call: { seam: Seam; name: string; version: string; registry: string; force: boolean; cacheDir?: string | undefined }) =>
    versionExists(existsCache, { ...call, head });

  return {
    latestVersion: async (options) => latestVersionOf(latestCache, ready, options),
    missingReleaseParts: async (options) => missingPartsOf(ready, options),
    probeRelease: async (options) => probeOf(latestCache, ready, options),
    reset: () => {
      latestCache.clear();
      existsCache.clear();
    },
  };
}

interface LatestVersionOptions {
  readonly seam: Seam;
  readonly name: string;
  readonly registry: string;
  readonly force?: boolean;
  readonly includePrerelease?: boolean;
  readonly cacheDir?: string | undefined;
}

interface MissingPartsOptions {
  readonly seam: Seam;
  readonly name: string;
  readonly registry: string;
  readonly version: string;
  readonly force?: boolean;
  readonly cacheDir?: string | undefined;
}

interface ProbeReleaseOptions {
  readonly seam: Seam;
  readonly package: string;
  readonly registry?: string | undefined;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly includePrerelease?: boolean;
  readonly cacheDir?: string | undefined;
  readonly prefix?: string | undefined;
}

function viewCommandOf(input: {
  readonly name: string;
  readonly registry: string;
  readonly includePrerelease: boolean;
  readonly cacheDir?: string | undefined;
}): readonly string[] {
  const target = input.includePrerelease
    ? `${quoteShellArg(input.name)} versions --json`
    : `${quoteShellArg(input.name)} version`;
  const tail = `--registry ${quoteShellArg(input.registry)}${cacheFlag(input.cacheDir)}`;
  const pnpm = process.env.DSH_WB_PNPM?.trim() ?? '';
  return [`npm view ${target} ${tail}`, `${pnpm === '' ? 'pnpm' : pnpm} view ${target} ${tail}`];
}

type ReadyOf = (call: {
  seam: Seam;
  name: string;
  version: string;
  registry: string;
  force: boolean;
  cacheDir?: string | undefined;
}) => Promise<ExistsEntry>;

async function latestVersionOf(latestCache: Map<string, CacheEntry>, ready: ReadyOf, options: {
  seam: Seam;
  name: string;
  registry: string;
  force?: boolean;
  includePrerelease?: boolean;
  cacheDir?: string | undefined;
}): Promise<string | undefined> {
  const { seam, name, registry, force = false, includePrerelease = false, cacheDir } = options;
  const key = `${registry}|${name}|${includePrerelease ? 'pre' : 'stable'}`;
  const hit = latestCache.get(key);
  if (!force && hit !== undefined && now() - hit.at < versionCacheTtl(hit.value)) return hit.value;

  let read: string | undefined;
  for (const command of viewCommandOf({ name, registry, includePrerelease, cacheDir })) {
    const result = await viewOnce(seam, [command]);
    const found = result.ok ? candidatesOf(result.stdout, includePrerelease) : [];
    for (const version of found.slice(0, MAX_TARBALL_PROBES)) {
      const entry = await ready({ seam, name, version, registry, force, cacheDir });
      if (entry.ready) {
        read = version;
        break;
      }
    }
    if (read !== undefined) break;
  }
  latestCache.set(key, { at: now(), value: read });
  return read;
}

interface ExistsEntry {
  readonly at: number;
  readonly value: boolean;
  readonly ready: boolean;
}

export type TarballHead = (url: string) => Promise<boolean>;

const HEAD_TIMEOUT_MS = 8000;

const MAX_TARBALL_PROBES = 3;

function defaultHead(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  return fetch(url, { method: 'HEAD', signal: controller.signal })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      clearTimeout(timer);
    });
}

async function tarballOk(head: TarballHead, url: string): Promise<boolean> {
  if (url === '') return false;
  return head(url);
}

async function entryOf(input: {
  seam: Seam;
  name: string;
  version: string;
  registry: string;
  head: TarballHead;
  cacheDir?: string | undefined;
}): Promise<ExistsEntry> {
  const { seam, name, version, registry, head, cacheDir } = input;
  const pnpm = process.env.DSH_WB_PNPM?.trim() ?? '';
  const commandsOf = (args: string): readonly string[] => {
    const spec = `${quoteShellArg(`${name}@${version}`)} ${args} --registry ${quoteShellArg(registry)}${cacheFlag(cacheDir)}`;
    return [`npm view ${spec}`, `${pnpm === '' ? 'pnpm' : pnpm} view ${spec}`];
  };
  const tarball = await viewOnce(seam, commandsOf('dist.tarball'));
  if (!tarball.ok) return { at: now(), value: false, ready: false };
  return { at: now(), value: true, ready: await tarballOk(head, tarball.stdout) };
}

async function versionExists(
  existsCache: Map<string, ExistsEntry>,
  options: {
    seam: Seam;
    name: string;
    version: string;
    registry: string;
    head: TarballHead;
    force?: boolean;
    cacheDir?: string | undefined;
  },
): Promise<ExistsEntry> {
  const { force = false } = options;
  const key = `${options.registry}|${options.name}@${options.version}`;
  const hit = existsCache.get(key);
  if (!force && hit !== undefined && (hit.ready || now() - hit.at < VERSION_CHECK_FAILURE_TTL_MS)) return hit;

  const entry = await entryOf(options);
  existsCache.set(key, entry);
  return entry;
}

async function missingPartsOf(
  ready: ReadyOf,
  options: {
    seam: Seam;
    name: string;
    registry: string;
    version: string;
    force?: boolean;
    cacheDir?: string | undefined;
  },
): Promise<readonly string[]> {
  const { seam, name, registry, version, force = false, cacheDir } = options;
  const checked = await Promise.all(
    RELEASE_PACKAGES.filter((part) => part !== name).map(async (part) => ({
      part,
      entry: await ready({ seam, name: part, version, registry, force, cacheDir }),
    })),
  );
  return checked.filter((one) => !one.entry.ready).map((one) => one.part);
}


async function probeOf(
  latestCache: Map<string, CacheEntry>,
  ready: ReadyOf,
  options: {
  seam: Seam;
  package: string;
  registry?: string | undefined;
  force?: boolean;
  check?: boolean;
  includePrerelease?: boolean;
  cacheDir?: string | undefined;
  prefix?: string | undefined;
}): Promise<PluginRelease | undefined> {
  const { seam, package: pkg, registry, force = false, check = true, includePrerelease = false, cacheDir, prefix } = options;
  if (pkg === "") return undefined;

  const ledger = await seam
    .run({
      command: `npm ls --prefix ${quoteShellArg(prefix ?? '')} ${quoteShellArg(pkg)} --json --depth=0${cacheFlag(cacheDir)}`,
      intent: productWrite(),
      retry: 'safe',
      timeoutMs: LEDGER_READ_TIMEOUT_MS,
      bestEffort: true,
    })
    .catch(() => undefined);
  const installed =
    ledger === undefined ? undefined : parseLedgerVersion(ledger.stdout, pkg);
  if (installed === undefined) return undefined;

  const source =
    registry === undefined || registry.trim() === ""
      ? undefined
      : registry.trim();
  const latest =
    source === undefined || !check
      ? undefined
      : await latestVersionOf(latestCache, ready, {
          seam,
          name: pkg,
          registry: source,
          force,
          includePrerelease,
          cacheDir,
        });

  return {
    installed,
    ...(latest === undefined ? {} : { latest }),
  };
}


