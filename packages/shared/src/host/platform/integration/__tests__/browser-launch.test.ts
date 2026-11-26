import { describe, expect, it } from 'vitest';

import { browserLaunchOf } from '../browser-launch.js';

describe('浏览器启动命令', () => {
  it('darwin 用 open，linux 用 setsid，win32 用 start', () => {
    expect(
      browserLaunchOf('chrome', 'darwin', {
        appPath: '/Applications/Google Chrome.app',
        executable: undefined,
        linuxBinary: '/usr/bin/google-chrome',
      })?.command,
    ).toBe("open -g -j -a '/Applications/Google Chrome.app'");
    expect(
      browserLaunchOf('chrome', 'linux', {
        appPath: '',
        executable: undefined,
        linuxBinary: '/usr/bin/google-chrome',
      })?.probe,
    ).toBe("command -v 'setsid'");
    expect(
      browserLaunchOf('chrome', 'win32', {
        appPath: '',
        executable: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        linuxBinary: '',
      })?.command,
    ).toContain('cmd /d /s /c start');
  });

  it('带上要打开的页面时，把地址原样交给浏览器', () => {
    expect(
      browserLaunchOf('chrome', 'darwin', {
        appPath: '/Applications/Google Chrome.app',
        executable: undefined,
        linuxBinary: '/usr/bin/google-chrome',
        url: 'chrome://extensions',
      })?.command,
    ).toBe("open -g -j -a '/Applications/Google Chrome.app' 'chrome://extensions'");
    expect(
      browserLaunchOf('chrome', 'linux', {
        appPath: '',
        executable: undefined,
        linuxBinary: '/usr/bin/google-chrome',
        url: 'chrome://extensions',
      })?.command,
    ).toContain('chrome://extensions');
    expect(
      browserLaunchOf('chrome', 'win32', {
        appPath: '',
        executable: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        linuxBinary: '',
        url: 'chrome://extensions',
      })?.command,
    ).toContain('chrome://extensions');
  });

  it('找不到可执行文件 / 不认识平台就不给命令', () => {
    expect(browserLaunchOf('chrome', 'win32', { appPath: '', executable: undefined, linuxBinary: '' })).toBeUndefined();
    expect(browserLaunchOf('chrome', 'other', { appPath: '', executable: undefined, linuxBinary: '' })).toBeUndefined();
  });
});
