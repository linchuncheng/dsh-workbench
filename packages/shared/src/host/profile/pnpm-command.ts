import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

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

export function profilePnpmCommand(profileDir: string, env: NodeJS.ProcessEnv = process.env): PnpmCommand {
  const configured = env.DSH_WB_PNPM?.trim();
  if (configured !== undefined && configured !== '') return { command: configured, args: [] };
  const modules = modulesOf(profileDir);
  const storeDir = typeof modules['storeDir'] === 'string' ? modules['storeDir'].trim() : '';
  const withStore = (command: PnpmCommand): PnpmCommand =>
    storeDir === '' ? command : { ...command, storeDir };
  const manager = typeof modules['packageManager'] === 'string' ? modules['packageManager'].trim() : '';
  if (manager === '') return withStore({ command: 'pnpm', args: [] });
  const version = manager.startsWith('pnpm@') ? manager.slice('pnpm@'.length) : '';
  const corepackHome = env.COREPACK_HOME?.trim() || join(homedir(), '.cache', 'node', 'corepack');
  const cached = join(corepackHome, 'v1', 'pnpm', version, 'bin', 'pnpm.cjs');
  if (version !== '' && existsSync(cached)) return withStore({ command: process.execPath, args: [cached] });
  return withStore({ command: 'corepack', args: [manager] });
}
