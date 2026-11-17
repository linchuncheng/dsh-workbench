import { describe, expect, it } from 'vitest';
import { bringBackCommand, frontAppCommand, frontAppOf } from '../front-app.js';

describe('把工作台带回前台：命令与解析', () => {
  it('★ macOS：问 lsappinfo 谁是前台（不要辅助功能权限）', () => {
    const command = frontAppCommand('darwin');

    expect(command).toContain('lsappinfo');
    expect(command).not.toContain('osascript');
  });

  it('★ macOS：从 lsappinfo 的输出里取 bundleID', () => {
    const stdout = '[ NULL ]  ASN:0x0-0xcb0cb0: (in front) \n    bundleID="com.apple.TextEdit"\n';
    expect(frontAppOf(stdout, 'darwin')).toBe('com.apple.TextEdit');
    expect(frontAppOf('bundleID=[ NULL ]', 'darwin')).toBeUndefined();
  });

  it('★ macOS：带回按 bundleID（open -b），名字带空格也只有一个参数', () => {
    expect(bringBackCommand('com.apple.TextEdit', 'darwin')).toBe("open -b 'com.apple.TextEdit'");
    expect(bringBackCommand('DeepSeek Harness', 'darwin')).toBe("open -b 'DeepSeek Harness'");
  });

  it('★ 应用名里的单引号会被转义，不会把命令切断', () => {
    expect(bringBackCommand("Bob's App", 'darwin')).toBe("open -b 'Bob'\\''s App'");
  });

  it('★ 解析：空输出当读不到，不留空串', () => {
    expect(frontAppOf('', 'darwin')).toBeUndefined();
    expect(frontAppOf('   \n', 'linux')).toBeUndefined();
  });

  it('★ Linux：读的是窗口号（带回时直接激活它）', () => {
    expect(frontAppOf('1234\n', 'linux')).toBe('1234');
    expect(bringBackCommand('1234', 'linux')).toBe("xdotool windowactivate '1234'");
  });

  it('★ Windows：读的是进程号（AppActivate 直接按号）', () => {
    expect(frontAppOf('notepad.exe\n', 'win32')).toBe('notepad.exe');
    expect(bringBackCommand('4242', 'win32')).toContain('AppActivate(4242)');
  });

  it('★ 空名字 / 不认识的平台：不给命令（不乱跑）', () => {
    expect(bringBackCommand('   ', 'darwin')).toBeUndefined();
    expect(frontAppCommand('other')).toBeUndefined();
    expect(bringBackCommand('x', 'other')).toBeUndefined();
  });

  it('★ Windows：前台应用走 user32 的 GetForegroundWindow，带回走 AppActivate', () => {
    const front = frontAppCommand('win32');
    const back = bringBackCommand('notepad', 'win32');

    expect(front).toContain('GetForegroundWindow');
    expect(back).toContain('AppActivate');
  });

  it('★ Windows：名字里的单引号按 PowerShell 的规矩加倍转义', () => {
    expect(bringBackCommand("Bob's App", 'win32')).toContain("AppActivate('Bob''s App')");
  });
});
