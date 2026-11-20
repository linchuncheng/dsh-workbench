import type { HostOs } from '../../../contract/protocol/platform.js';
import { hostOsOf } from '../facts.js';

/**
 * 一台机器上跑命令的那种 shell：POSIX 系（sh / bash / zsh），或 dsh 在 Windows 上用的 pwsh。
 */
export type ShellKind = 'posix' | 'pwsh';

/**
 * 按目标平台判 shell 种类：win32 是 pwsh（dsh 的 Windows 执行器就是 PowerShell），其余是 POSIX。
 * @param platform - 目标平台，默认当前 `process.platform`。
 * @returns `'pwsh'` 或 `'posix'`。
 */
export function shellKindOf(platform?: NodeJS.Platform | HostOs): ShellKind {
  return hostOsOf(platform) === 'win32' ? 'pwsh' : 'posix';
}

/**
 * 按目标平台补齐包装器的文件名：win32 上是 `.cmd`，其余原样。
 * @param name - 包装器名（不带扩展名）。
 * @param platform - 目标平台，默认当前 `process.platform`。
 * @returns 该平台上可直接执行的文件名。
 */
export function cmdNameOf(name: string, platform?: NodeJS.Platform | HostOs): string {
  return hostOsOf(platform) === 'win32' ? `${name}.cmd` : name;
}

/**
 * 按目标平台把一个值裹成 shell 字面量：POSIX 用单引号并按 `'\''` 逃逸，pwsh 也用单引号但按 `''` 逃逸。
 * @param value - 任意值；不是字符串的先 `String()`。
 * @param platform - 目标平台，默认当前 `process.platform`。
 * @returns 可安全拼进该平台 shell 命令的一段文本；含空格 / 元字符的值不会被当成语法。
 */
export function quoteShellArgFor(value: unknown, platform?: NodeJS.Platform | HostOs): string {
  const text = String(value);
  if (shellKindOf(platform) === 'pwsh') return `'${text.replace(/'/g, "''")}'`;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * 按当前平台把值裹成 shell 字面量；跨平台代码要固定平台时用 `quoteShellArgFor`。
 * @param value - 任意值；不是字符串的先 `String()`。
 * @returns 可安全拼进当前平台 shell 命令的一段文本。
 */
export function quoteShellArg(value: unknown): string {
  return quoteShellArgFor(value);
}

/**
 * 取一段文本的末尾若干行（如命令输出），顺带去掉首尾空白。
 * @param text - 原文；`null` / `undefined` 当空串。
 * @param lines - 最多留几行，默认 6；0 给全篇、负数从开头砍掉那么多行（都是 `slice` 语义），调用方传正数。
 * @returns 末尾若干行、去首尾空行后的文本；原文行数不够就全给，空输入给空串。
 */
export function tailLines(text: string | null | undefined, lines = 6): string {
  const all = String(text ?? '')
    .trim()
    .split('\n');
  return all.slice(-lines).join('\n');
}

const FAILURE_HINT =
  /(?:\bERR_(?:PNPM|NPM)_[A-Z0-9_]+|npm (?:ERR!|error)\b|\b(?:Error|TypeError|RangeError|FetchError|RequestError|SyntaxError):|\b(?:EACCES|EPERM|ENOENT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPROTO|ENETUNREACH|EHOSTUNREACH|ENETDOWN|ENOSPC|EROFS|EMFILE|EADDRINUSE)\b|socket hang up|certificate|self[- ]signed|unable to verify|tls handshake)/;

const FAILURE_NOISE = /^(?:update available\b|progress:|packages:)/i;

const ANSI_SEQUENCE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const MAX_LINE = 400;

function clippedLine(line: string): string {
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line;
}

/**
 * 从命令输出里抽一段能看的失败原文：保留真正的错误行与末尾几行，跳过 pnpm 的更新提示这类噪音。
 * @param text - 原文（通常是 stderr，取不到时给 stdout）；`null` / `undefined` 当空串。
 * @param lines - 末尾再留几行，默认 4。
 * @returns 最多 6 行、去重后的失败原文；空输入给空串。
 */
export function failureSummaryOf(text: string | null | undefined, lines = 4): string {
  const all = String(text ?? '')
    .replace(ANSI_SEQUENCE, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const head = all[0];
  if (head === undefined) return '';
  const picked: string[] = [];
  const add = (line: string): void => {
    if (!picked.includes(line)) picked.push(line);
  };
  if (!FAILURE_NOISE.test(head)) add(head);
  for (const line of all.filter((line) => FAILURE_HINT.test(line)).slice(0, 2)) add(line);
  for (const line of all.slice(-lines)) add(line);
  return (picked.length === 0 ? [head] : picked).map(clippedLine).join('\n');
}
