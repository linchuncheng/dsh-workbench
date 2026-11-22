import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { splitShellLine } from '../platform/ops/shell-text.js';
import { readJsonObject } from '../runtime/read-json.js';

export interface PnpmCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly storeDir?: string | undefined;
}

function modulesOf(profileDir: string): Readonly<Record<string, unknown>> {
  try {
    const raw = readFileSync(join(profileDir, 'node_modules', '.modules.yaml'), 'utf8');
    const modules = parse(raw) as unknown;
    return typeof modules === 'object' && modules !== null ? (modules as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function majorOf(version: string): string {
  return version.split('.')[0] ?? '';
}

export function bundledPnpmOf(execPath: string, wanted: string): string | undefined {
  if (wanted === '') return undefined;
  const candidate = join(dirname(execPath), '..', '..', 'pnpm', 'bin', 'pnpm.cjs');
  if (!existsSync(candidate)) return undefined;
  const manifest = readJsonObject(join(dirname(candidate), '..', 'package.json'));
  const bundled = typeof manifest?.['version'] === 'string' ? manifest['version'] : '';
  return majorOf(bundled) === majorOf(wanted) ? candidate : undefined;
}

function configuredCommand(env: NodeJS.ProcessEnv): PnpmCommand | undefined {
  const configured = env.DSH_WB_PNPM?.trim();
  if (configured === undefined || configured === '') return undefined;
  const [command, ...args] = splitShellLine(configured);
  return command === undefined ? undefined : { command, args };
}

export function profilePnpmCommand(profileDir: string, env: NodeJS.ProcessEnv = process.env): PnpmCommand {
  const modules = modulesOf(profileDir);
  const storeDir = typeof modules['storeDir'] === 'string' ? modules['storeDir'].trim() : '';
  const withStore = (command: PnpmCommand): PnpmCommand =>
    storeDir === '' ? command : { ...command, storeDir };
  const manager = typeof modules['packageManager'] === 'string' ? modules['packageManager'].trim() : '';
  const configured = configuredCommand(env);
  const fallback = configured ?? { command: 'pnpm', args: [] };
  if (manager === '') return withStore(fallback);
  const version = manager.startsWith('pnpm@') ? manager.slice('pnpm@'.length) : '';
  const corepackHome = env.COREPACK_HOME?.trim() || join(homedir(), '.cache', 'node', 'corepack');
  const cached = version === '' ? undefined : join(corepackHome, 'v1', 'pnpm', version, 'bin', 'pnpm.cjs');
  const pnpmCjs = (cached !== undefined && existsSync(cached) ? cached : undefined) ?? bundledPnpmOf(process.execPath, version);
  if (pnpmCjs !== undefined) return withStore({ command: process.execPath, args: [pnpmCjs] });
  if (configured !== undefined) return withStore(fallback);
  return withStore({ command: 'corepack', args: [manager] });
}
