import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { workspacesRoot } from '../data/data-root.js';
import type { DiagRecorder } from './diag-records.js';
import { writeJsonFile } from './fs-write.js';

export interface ModuleStore {
  readonly dir: string;
  read(name: string): unknown | null;
  write(name: string, value: unknown): void;
  remove(name: string): void;
  list(): string[];
}

/** 按工作区隔离的模块存储。 */
export interface WorkspaceStore {
  /** 取单元 + 工作区的存储；workspace 为 null 或空串时是进程内存储（重启就丢）。 */
  for(unitId: string, workspace: string | null): ModuleStore;
  machine(unitId: string): ModuleStore;
  scan(unitId: string): ModuleStore[];
}

function slug(raw: string, max = 40): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max);
  return cleaned === '' ? 'workspace' : cleaned;
}

export function workspaceKey(workspace: string): string {
  const abs = path.resolve(workspace);
  return `${slug(path.basename(abs))}-${createHash('sha1').update(abs).digest('hex').slice(0, 8)}`;
}

function safeName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') {
    throw new Error(`模块文件夹里只接受相对文件名，收到的是「${name}」`);
  }
  if (trimmed.includes('\0') || path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new Error(`模块只能写自己的文件夹：不接受绝对路径「${name}」`);
  }
  if (trimmed.replace(/\\/g, '/').split('/').includes('..')) {
    throw new Error(`模块只能写自己的文件夹：路径越界「${name}」`);
  }
  return trimmed;
}

function inside(dir: string, name: string): string {
  const full = path.resolve(dir, safeName(name));
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new Error(`模块只能写自己的文件夹：路径越界「${name}」`);
  }
  return full;
}

function memoryStore(dir: string): ModuleStore {
  const files = new Map<string, unknown>();
  return {
    dir,
    read: (name) => {
      safeName(name);
      return files.get(name) ?? null;
    },
    write: (name, value) => {
      safeName(name);
      files.set(name, value);
    },
    remove: (name) => {
      safeName(name);
      files.delete(name);
    },
    list: () => [...files.keys()].sort(),
  };
}

const CORRUPT_DIR = '.corrupt';

function corruptCopyOf(dir: string, name: string): string {
  const target = path.join(dir, CORRUPT_DIR);
  fs.mkdirSync(target, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const flat = name.replace(/[\\/]/g, '__');
  return path.join(target, `${flat}.${stamp}`);
}

function parseFile(file: string): { readonly kind: 'absent' } | { readonly kind: 'value'; readonly value: unknown } | { readonly kind: 'broken'; readonly reason: string } {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' };
    return { kind: 'broken', reason: error instanceof Error ? error.message : String(error) };
  }
  try {
    return { kind: 'value', value: JSON.parse(text) as unknown };
  } catch (error) {
    return { kind: 'broken', reason: error instanceof Error ? error.message : String(error) };
  }
}

function fileStore(
  dir: string,
  warn?: ((message: string) => void) | undefined,
  diag?: DiagRecorder | undefined,
): ModuleStore {
  const noted = new Set<string>();
  const noteCorrupt = (file: string, reason: string): void => {
    if (noted.has(file)) return;
    noted.add(file);
    diag?.once(`config-corrupt:${file}`, {
      code: 'CONFIG_CORRUPT',
      level: 'error',
      detail: { path: file, reason },
    });
    warn?.(
      `[dsh-workbench] 模块配置文件读不出来：${file}（${reason}）。下一次写入会先把它备份到 ${CORRUPT_DIR}/，不会直接盖掉`,
    );
  };
  return {
    dir,
    read: (name) => {
      const file = inside(dir, name);
      const parsed = parseFile(file);
      if (parsed.kind === 'value') return parsed.value;
      if (parsed.kind === 'broken') noteCorrupt(name, parsed.reason);
      return null;
    },
    write: (name, value) => {
      const file = inside(dir, name);
      const before = parseFile(file);
      if (before.kind === 'broken') {
        noteCorrupt(name, before.reason);
        try {
          fs.copyFileSync(file, corruptCopyOf(dir, name));
        } catch (error) {
          throw new Error(
            `这份配置读不出来，备份也失败，为了不弄丢它没有覆盖：${file}（${error instanceof Error ? error.message : String(error)}）`,
            { cause: error },
          );
        }
      }
      writeJsonFile(file, value);
    },
    remove: (name) => {
      const file = inside(dir, name);
      try {
        fs.unlinkSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
    list: () => {
      try {
        return fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
    },
  };
}

export function createWorkspaceStore(options: {
  readonly root?: string | null | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
  readonly diag?: DiagRecorder | undefined;
}): WorkspaceStore {
  const root = options.root === null ? null : options.root ?? workspacesRoot();
  let warned = false;
  const memory = new Map<string, ModuleStore>();
  const fallback = (dir: string): ModuleStore => {
    if (!warned) {
      warned = true;
      options.logger?.warn?.(
        '[dsh-workbench] 没有可写的数据根：模块配置只在本进程内生效（见 shared/src/host/data/data-root.ts）',
      );
    }
    const hit = memory.get(dir);
    if (hit !== undefined) return hit;
    const created = memoryStore(dir);
    memory.set(dir, created);
    return created;
  };

  const open = (parts: readonly string[]): ModuleStore =>
    root === null
      ? fallback(path.join('/_memory', ...parts))
      : fileStore(
          path.join(
            root,
            ...parts.map((part) => slug(part)),
          ),
          options.logger?.warn?.bind(options.logger),
          options.diag,
        );

  return {
    for: (unitId, workspace) =>
      workspace === null || workspace.trim() === ''
        ? fallback(path.join('/_memory', slug(unitId)))
        : open([workspaceKey(workspace), unitId]),
    machine: (unitId) => open(['_machine', unitId]),
    scan: (unitId) => {
      if (root === null) return [];
      let entries: string[];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
      return entries.map((key) =>
        fileStore(path.join(root, key, slug(unitId)), options.logger?.warn?.bind(options.logger), options.diag),
      );
    },
  };
}
