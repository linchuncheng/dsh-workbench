import { win32 } from 'node:path';
import { shellKindOf } from '../ops/shell-text.js';

export interface ProcessPlatformInput {
  readonly platform?: NodeJS.Platform | undefined;
  readonly systemRoot?: string | undefined;
}

export interface ProcessPlatform {
  readonly windows: boolean;
  readonly systemRoot?: string | undefined;
}

export function processPlatformOf(input: ProcessPlatformInput = {}): ProcessPlatform {
  const windows = input.platform === undefined ? shellKindOf() === 'pwsh' : input.platform === 'win32';
  const candidate = input.systemRoot ?? process.env['SystemRoot'] ?? process.env['windir'];
  const systemRoot =
    candidate !== undefined && /^[A-Za-z]:[\\/]/.test(candidate) ? candidate : undefined;
  return { windows, ...(systemRoot === undefined ? {} : { systemRoot }) };
}

export function taskkillArgvOf(
  pid: number,
  systemRoot: string,
): { readonly file: string; readonly args: readonly string[] } {
  return { file: win32.join(systemRoot, 'System32', 'taskkill.exe'), args: ['/pid', String(pid), '/T', '/F'] };
}
