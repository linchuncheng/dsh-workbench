import type { DesktopBrowserId } from '../../../contract/protocol/preflight-wake.js';
import type { HostOs } from '../../../contract/protocol/platform.js';
import { quoteShellArgFor } from '../ops/shell.js';
import { browserInstallCandidates } from './browsers.js';

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


export function browserWakeSupportedOf(platform: HostOs): boolean {
  return platform === 'darwin' || platform === 'linux' || platform === 'win32';
}

export function browserExecutableOf(
  id: DesktopBrowserId,
  platform: HostOs,
  options: { readonly env: NodeJS.ProcessEnv; readonly home: string; readonly exists: (path: string) => boolean },
): string | undefined {
  if (platform !== 'win32') return undefined;
  return browserInstallCandidates(id, 'win32', { env: options.env, home: options.home }).find((path) =>
    options.exists(path),
  );
}
