import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { writeTextFileExclusive } from '../runtime/fs-write.js';

export interface DraftRef {
  readonly id: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export type DraftProblemCode =
  | 'no-session'
  | 'too-large'
  | 'binary'
  | 'missing'
  | 'foreign'
  | 'write-failed';

export interface DraftProblem {
  readonly ok: false;
  readonly code: DraftProblemCode;
  readonly message: string;
}

export type DraftPutResult = (DraftRef & { readonly ok: true }) | DraftProblem;

export type DraftContentResult =
  | {
      readonly ok: true;
      readonly content: string;
      readonly path: string;
      readonly bytes: number;
    }
  | DraftProblem;

export type DraftPathResult =
  | { readonly ok: true; readonly path: string }
  | DraftProblem;

export interface DraftStoreOptions {
  readonly root?: string | undefined;
  readonly maxBytes?: number | undefined;
}

export interface DraftPutInput {
  readonly session: string;
  readonly content: string;
  readonly label?: string | undefined;
}

export interface DraftLookup {
  readonly id: string;
  readonly session?: string | undefined;
}

export interface DraftStore {
  put(input: DraftPutInput): DraftPutResult;
  content(input: DraftLookup): DraftContentResult;
  pathOf(input: { readonly id: string; readonly session: string }): DraftPathResult;
  dispose(): void;
}

interface DraftEntry {
  readonly session: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface DraftFound {
  readonly ok: true;
  readonly entry: DraftEntry;
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

function problem(code: DraftProblemCode, message: string): DraftProblem {
  return { ok: false, code, message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileNameOf(label: string | undefined): string {
  const raw = label === undefined ? '' : basename(label);
  const safe = raw
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 80);
  return safe === '' ? 'draft.txt' : safe;
}

function sessionDirName(session: string): string {
  return createHash('sha256').update(session).digest('hex').slice(0, 16);
}

/**
 * 建一份会话草稿库：正文落到系统临时目录，按会话隔离，只认自己发出的 id。
 * @param options.root 固定的草稿根目录；不填时首次使用时在系统临时目录里建。
 * @param options.maxBytes 单份草稿的 UTF-8 字节上限，默认 16 MiB。
 * @returns `put` / `content` / `pathOf` / `dispose`。
 */
export function createDraftStore(options: DraftStoreOptions = {}): DraftStore {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const entries = new Map<string, DraftEntry>();
  let root = options.root ?? null;
  let disposed = false;

  const ensureRoot = (): string => {
    if (root === null) {
      root = mkdtempSync(join(tmpdir(), 'dsh-wb-'));
      chmodSync(root, 0o700);
      return root;
    }
    mkdirSync(root, { recursive: true, mode: 0o700 });
    return root;
  };

  const sessionDirOf = (session: string): string => {
    const dir = join(ensureRoot(), sessionDirName(session));
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  };

  const foundOf = (input: DraftLookup): DraftFound | DraftProblem => {
    if (disposed) return problem('missing', '草稿库已经关了，草稿也失效了。');
    const entry = entries.get(input.id.trim());
    if (entry === undefined) {
      return problem('missing', '草稿不存在或已经失效：重新读一次文件再改。');
    }
    if (input.session !== undefined && input.session.trim() !== entry.session) {
      return problem('foreign', '这份草稿不属于当前会话。');
    }
    return { ok: true, entry };
  };

  const put = (input: DraftPutInput): DraftPutResult => {
    if (disposed) return problem('missing', '草稿库已经关了，不能再建草稿。');
    const session = input.session.trim();
    if (session === '') {
      return problem('no-session', '这个会话没有 id，不能建草稿。');
    }
    const bytes = Buffer.byteLength(input.content, 'utf8');
    if (input.content.includes('\0')) {
      return problem(
        'binary',
        `这份内容像二进制（${bytes} 字节），草稿只收 UTF-8 文本。`,
      );
    }
    if (bytes > maxBytes) {
      return problem(
        'too-large',
        `这份内容 ${bytes} 字节，超过草稿上限 ${maxBytes} 字节。`,
      );
    }
    try {
      const dir = sessionDirOf(session);
      let id = '';
      let path = '';
      for (let attempt = 0; attempt < 4; attempt += 1) {
        id = randomBytes(12).toString('hex');
        if (entries.has(id)) continue;
        path = join(dir, `${id}-${fileNameOf(input.label)}`);
        if (writeTextFileExclusive(path, input.content, { mode: 0o600 })) {
          break;
        }
        path = '';
      }
      if (path === '') {
        return problem('write-failed', '草稿文件名连续撞了四次，先停一下。');
      }
      const entry: DraftEntry = {
        session,
        path,
        bytes,
        sha256: createHash('sha256').update(input.content).digest('hex'),
      };
      entries.set(id, entry);
      return {
        ok: true,
        id,
        path: entry.path,
        bytes: entry.bytes,
        sha256: entry.sha256,
      };
    } catch (error) {
      return problem('write-failed', `草稿写不进去：${messageOf(error)}`);
    }
  };

  const checkedOf = (input: DraftLookup): DraftFound | DraftProblem => {
    const found = foundOf(input);
    if (!found.ok) return found;
    try {
      const stat = lstatSync(found.entry.path);
      if (!stat.isFile()) {
        return problem('missing', '草稿文件不见了：重新读一次文件再改。');
      }
      return found;
    } catch (error) {
      return problem('missing', `草稿读不回来：${messageOf(error)}`);
    }
  };

  const pathOf = (input: DraftLookup): DraftPathResult => {
    const found = checkedOf(input);
    return found.ok ? { ok: true, path: found.entry.path } : found;
  };

  const content = (input: DraftLookup): DraftContentResult => {
    const found = checkedOf(input);
    if (!found.ok) return found;
    try {
      const text = readFileSync(found.entry.path, 'utf8');
      return {
        ok: true,
        content: text,
        path: found.entry.path,
        bytes: Buffer.byteLength(text, 'utf8'),
      };
    } catch (error) {
      return problem('missing', `草稿读不回来：${messageOf(error)}`);
    }
  };

  const dispose = (): void => {
    disposed = true;
    entries.clear();
    if (root !== null) {
      rmSync(root, { recursive: true, force: true });
      root = null;
    }
  };

  return { put, content, pathOf, dispose };
}
