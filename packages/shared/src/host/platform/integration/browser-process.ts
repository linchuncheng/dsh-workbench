import type { DesktopBrowserId } from '../../../contract/protocol/preflight-wake.js';
import type { HostOs } from '../../../contract/protocol/platform.js';
import { quoteShellArgFor } from '../ops/shell.js';
import { BROWSER_SPECS } from './browsers.js';

export interface BrowserProcessSpec {
  readonly command: string;
  idsOf(stdout: string): DesktopBrowserId[];
}

export function browserProcessOf(platform: HostOs): BrowserProcessSpec | undefined {
  if (platform === 'darwin' || platform === 'linux') {
    const names = BROWSER_SPECS.map((spec) =>
      quoteShellArgFor(platform === 'darwin' ? spec.macProcess : spec.linuxProcess, platform),
    );
    return {
      command: `pgrep -lx ${names.join(' ')}`,
      idsOf(stdout) {
        const found: DesktopBrowserId[] = [];
        for (const line of stdout.split('\n')) {
          const match = /^\s*\d+\s+(.+?)\s*$/.exec(line);
          const name = match?.[1];
          if (name === undefined) continue;
          const spec = BROWSER_SPECS.find((item) => item.macProcess === name || item.linuxProcess === name);
          if (spec !== undefined && !found.includes(spec.id)) found.push(spec.id);
        }
        return found;
      },
    };
  }
  if (platform === 'win32') {
    return {
      command: 'tasklist /FO CSV /NH',
      idsOf(stdout) {
        const found: DesktopBrowserId[] = [];
        const map: Readonly<Record<string, DesktopBrowserId>> = {
          'chrome.exe': 'chrome',
          'msedge.exe': 'edge',
          'brave.exe': 'brave',
          'chromium.exe': 'chromium',
          'vivaldi.exe': 'vivaldi',
        };
        for (const line of stdout.split('\n')) {
          const name = /^"([^"]+)"/.exec(line)?.[1]?.toLowerCase();
          if (name === undefined) continue;
          const id = map[name];
          if (id !== undefined) found.push(id);
        }
        return [...new Set(found)];
      },
    };
  }
  return undefined;
}
