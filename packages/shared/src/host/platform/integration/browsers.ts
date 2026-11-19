import type { DesktopBrowserId } from '../../../contract/protocol/preflight-wake.js';
import type { HostOs } from '../../../contract/protocol/platform.js';
import { join, win32 } from 'node:path';

export interface BrowserSpec {
  readonly id: DesktopBrowserId;
  readonly label: string;
  readonly macProcess: string;
  readonly linuxBinary: string;
  readonly linuxProcess: string;
  readonly windowsRelative: readonly string[];
}

function browserSpec(
  id: DesktopBrowserId,
  label: string,
  macProcess: string,
  linuxBinary: string,
  linuxProcess: string,
  windowsRelative: readonly string[],
): BrowserSpec {
  return { id, label, macProcess, linuxBinary, linuxProcess, windowsRelative };
}

export const BROWSER_SPECS: readonly BrowserSpec[] = [
  browserSpec('chrome', 'Google Chrome', 'Google Chrome', '/usr/bin/google-chrome', 'chrome', ['Google', 'Chrome', 'Application', 'chrome.exe']),
  browserSpec('edge', 'Microsoft Edge', 'Microsoft Edge', '/usr/bin/microsoft-edge', 'msedge', ['Microsoft', 'Edge', 'Application', 'msedge.exe']),
  browserSpec('brave', 'Brave Browser', 'Brave Browser', '/usr/bin/brave-browser', 'brave', ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe']),
  browserSpec('chromium', 'Chromium', 'Chromium', '/usr/bin/chromium', 'chromium', ['Chromium', 'Application', 'chrome.exe']),
  browserSpec('vivaldi', 'Vivaldi', 'Vivaldi', '/usr/bin/vivaldi', 'vivaldi-bin', ['Vivaldi', 'Application', 'vivaldi.exe']),
];

function specOf(id: DesktopBrowserId): BrowserSpec {
  return BROWSER_SPECS.find((one) => one.id === id) ?? BROWSER_SPECS[0]!;
}

export function browserInstallCandidates(
  id: DesktopBrowserId,
  platform: HostOs,
  options: { readonly env: NodeJS.ProcessEnv; readonly home: string },
): readonly string[] {
  const spec = specOf(id);
  if (platform === 'darwin') {
    return [`/Applications/${spec.label}.app`, join(options.home, 'Applications', `${spec.label}.app`)];
  }
  if (platform === 'linux') return [spec.linuxBinary];
  if (platform === 'win32') {
    const programFiles = options.env.ProgramFiles ?? options.env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 = options.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = options.env.LOCALAPPDATA ?? join(options.home, 'AppData', 'Local');
    const bases =
      id === 'edge' || id === 'chrome' || id === 'brave'
        ? [programFiles, programFilesX86, localAppData]
        : [localAppData, programFiles];
    return bases.map((base) => win32.join(base, ...spec.windowsRelative));
  }
  return [];
}
