import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserExtension } from '@dsh-workbench/shared/host';
import { copyDirInto, ensureDir, readJsonObject, removePath } from '@dsh-workbench/shared/host';
import { withDirLockSync } from '../foundation/lock.js';
import { isolatedRoot } from '../foundation/paths.js';

export interface BrowserExtensionOptions {
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly bundledDir?: string | undefined;
  readonly stableDir?: string | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

const EXTENSION_ENV = 'DSH_WB_OPENCLI_EXTENSION';
const MANIFEST = 'manifest.json';
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function stableDirOf(): string {
  return join(isolatedRoot(), 'extension');
}

function manifestVersionOf(dir: string): string | undefined {
  const version = readJsonObject(join(dir, MANIFEST))?.['version'];
  return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined;
}

function filesUnder(dir: string, prefix = ''): readonly string[] {
  const found: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(join(dir, entry.name), rel));
    else if (entry.isFile()) found.push(rel);
  }
  return found;
}

function digestOf(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function sameContent(left: string, right: string, files: readonly string[]): boolean {
  return files.every((rel) => {
    const from = join(left, rel);
    const to = join(right, rel);
    return existsSync(from) && existsSync(to) && digestOf(from) === digestOf(to);
  });
}

function bundledDirOf(): string | undefined {
  const dir = join(PACKAGE_ROOT, 'vendor', 'browser-extension');
  return existsSync(join(dir, MANIFEST)) ? dir : undefined;
}

function copyOver(from: string, to: string): void {
  ensureDir(to);
  const files = filesUnder(from);
  for (const rel of files) {
    if (rel === MANIFEST) continue;
    const target = join(to, rel);
    ensureDir(dirname(target));
    cpSync(join(from, rel), target);
  }
  if (files.includes(MANIFEST)) cpSync(join(from, MANIFEST), join(to, MANIFEST));
}

interface RefreshInput {
  readonly bundled: string;
  readonly stable: string;
  readonly version: string;
  readonly log?: ((message: string) => void) | undefined;
}

function refresh(input: RefreshInput): void {
  const files = filesUnder(input.bundled);
  withDirLockSync(input.stable, () => {
    if (manifestVersionOf(input.stable) === input.version && sameContent(input.bundled, input.stable, files)) return;
    const staging = `${input.stable}.next-${process.pid}`;
    const aside = `${input.stable}.stale-${process.pid}`;
    removePath(staging);
    removePath(aside);
    copyDirInto(input.bundled, staging);
    let asideTaken = false;
    try {
      renameSync(input.stable, aside);
      asideTaken = true;
      renameSync(staging, input.stable);
    } catch (error) {
      input.log?.(`[dsh-workbench] 浏览器扩展目录替换失败，改为原地覆盖（${input.stable}）：${String(error)}`);
      if (!existsSync(input.stable) && asideTaken && existsSync(aside)) {
        try {
          renameSync(aside, input.stable);
        } catch (error) {
          input.log?.(`[dsh-workbench] 浏览器扩展目录还原失败，改为原地覆盖（${input.stable}）：${String(error)}`);
          ensureDir(input.stable);
        }
      }
      copyOver(input.bundled, input.stable);
    } finally {
      removePath(staging);
      removePath(aside);
    }
    if (!sameContent(input.bundled, input.stable, files)) {
      throw new Error(`浏览器扩展目录与随包副本内容不一致：${input.stable}`);
    }
  });
}

export function browserExtensionOf(options: BrowserExtensionOptions = {}): BrowserExtension | undefined {
  const env = options.env ?? process.env;
  const asked = (env[EXTENSION_ENV] ?? '').trim();
  if (asked !== '') {
    const version = manifestVersionOf(asked);
    if (version !== undefined) return { dir: asked, version, source: 'env' };
    options.log?.(`[dsh-workbench] 浏览器扩展用 ${EXTENSION_ENV} 指定的副本：目录里没有可用的 manifest.json（需要 version），改用随包副本（${asked}）`);
  }
  const bundled = options.bundledDir ?? bundledDirOf();
  const stable = options.stableDir ?? stableDirOf();
  const bundledVersion = bundled === undefined ? undefined : manifestVersionOf(bundled);
  if (bundled === undefined || bundledVersion === undefined) {
    const version = manifestVersionOf(stable);
    return version === undefined ? undefined : { dir: stable, version, source: 'bundled' };
  }
  try {
    refresh({ bundled, stable, version: bundledVersion, log: options.log });
  } catch (error) {
    options.log?.(`[dsh-workbench] 刷新浏览器扩展目录失败（${stable}）：${String(error)}`);
  }
  const settled = manifestVersionOf(stable);
  return settled === undefined ? undefined : { dir: stable, version: settled, source: 'bundled' };
}