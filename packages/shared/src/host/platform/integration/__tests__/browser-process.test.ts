import { describe, expect, it } from 'vitest';

import { browserProcessOf } from '../browser-process.js';

describe('浏览器进程探测', () => {
  it('macOS 走 pgrep，win32 走 tasklist', () => {
    expect(browserProcessOf('darwin')?.command.startsWith('pgrep -lx ')).toBe(true);
    expect(browserProcessOf('win32')?.command).toBe('tasklist /FO CSV /NH');
    expect(browserProcessOf('other')).toBeUndefined();
  });

  it('解析进程名与 exe 名', () => {
    expect(browserProcessOf('darwin')?.idsOf('1000 Google Chrome\n1001 Vivaldi\n')).toEqual(['chrome', 'vivaldi']);
    expect(browserProcessOf('win32')?.idsOf('"chrome.exe","1","Console","1","1"\n"msedge.exe","2","Console","1","1"\n')).toEqual([
      'chrome',
      'edge',
    ]);
  });
});
