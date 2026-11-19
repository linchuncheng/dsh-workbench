import type { HostOs } from '../../../contract/protocol/platform.js';
import type { ShellKind } from '../../shell/shell-text.js';
import { quoteShellArgFor } from '../ops/shell.js';

export interface ToolLookupSpec {
  readonly line: string;
  readonly shellKind: ShellKind;
}

export function toolLookupOf(name: string, platform: HostOs): ToolLookupSpec {
  if (platform === 'win32') {
    return { line: `where.exe ${quoteShellArgFor(name, 'win32')}`, shellKind: 'pwsh' };
  }
  return { line: `command -v ${quoteShellArgFor(name, platform)}`, shellKind: 'posix' };
}
