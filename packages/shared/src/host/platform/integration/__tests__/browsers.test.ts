import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BROWSER_SPECS, browserInstallCandidates } from '../browsers.js';

describe('浏览器安装候选', () => {
  it('三台 OS 的候选路径', () => {
    expect(browserInstallCandidates('chrome', 'darwin', { env: {}, home: '/Users/me' })).toEqual([
      '/Applications/Google Chrome.app',
      join('/Users/me', 'Applications', 'Google Chrome.app'),
    ]);
    expect(browserInstallCandidates('chrome', 'linux', { env: {}, home: '/home/me' })).toEqual([
      '/usr/bin/google-chrome',
    ]);
    expect(
      browserInstallCandidates('chrome', 'win32', {
        env: { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
        home: 'C:\\Users\\me',
      })[0],
    ).toBe('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    expect(browserInstallCandidates('chrome', 'other', { env: {}, home: '/tmp' })).toEqual([]);
  });

  it('五个浏览器都有完整数据', () => {
    expect(BROWSER_SPECS.map((one) => one.id)).toEqual(['chrome', 'edge', 'brave', 'chromium', 'vivaldi']);
    for (const spec of BROWSER_SPECS) expect(spec.windowsRelative.length).toBeGreaterThanOrEqual(3);
  });
});
