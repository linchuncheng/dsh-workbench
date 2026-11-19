import type { DesktopBrowserId } from '../../../contract/protocol/preflight-wake.js';
import type { HostOs } from '../../../contract/protocol/platform.js';
import { quoteShellArgFor } from '../ops/shell.js';

export interface BrowserLaunchSpec {
  readonly command: string;
  readonly probe?: string;
}

export function browserLaunchOf(
  id: DesktopBrowserId,
  platform: HostOs,
  target: { readonly appPath: string; readonly executable: string | undefined; readonly linuxBinary: string },
): BrowserLaunchSpec | undefined {
  if (platform === 'darwin') {
    return { command: `open -g -j -a ${quoteShellArgFor(target.appPath, 'darwin')}` };
  }
  if (platform === 'linux') {
    return {
      probe: `command -v ${quoteShellArgFor('setsid', 'linux')}`,
      command: `setsid ${quoteShellArgFor(target.linuxBinary, 'linux')} --no-startup-window >/dev/null 2>&1 < /dev/null &`,
    };
  }
  if (platform === 'win32') {
    if (target.executable === undefined) return undefined;
    return { command: `cmd /d /s /c start "" ${quoteShellArgFor(target.executable, 'win32')}` };
  }
  return undefined;
}
