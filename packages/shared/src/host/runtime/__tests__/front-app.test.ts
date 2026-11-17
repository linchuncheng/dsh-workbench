import { describe, expect, it } from 'vitest';
import { bringBackCommand, frontAppCommand, frontAppOf } from '../front-app.js';

describe('把工作台带回前台：命令与解析', () => {
  it('★ macOS：问 System Events 谁是前台应用', () => {
    const command = frontAppCommand('darwin');

    expect(command).toContain('osascript');
    expect(command).toContain('frontmost is true');
  });

  it('★ macOS：带回就是 open -a <应用名>，名字带空格也只有一个参数', () => {
    expect(bringBackCommand('DeepSeek Harness', 'darwin')).toBe("open -a 'DeepSeek Harness'");
  });

  it('★ 应用名里的单引号会被转义，不会把命令切断', () => {
    expect(bringBackCommand("Bob's App", 'darwin')).toBe("open -a 'Bob'\\''s App'");
  });

  it('★ 解析：取最后一行非空输出', () => {
    expect(frontAppOf('Finder\nDeepSeek Harness\n', 'darwin')).toBe('DeepSeek Harness');
    expect(frontAppOf('', 'darwin')).toBeUndefined();
  });

  it('★ Linux：取 comm 那一列', () => {
    expect(frontAppOf('1234\ncode\n', 'linux')).toBe('code');
  });

  it('★ 空名字 / 不认识的平台：不给命令（不乱跑）', () => {
    expect(bringBackCommand('   ', 'darwin')).toBeUndefined();
    expect(frontAppCommand('other')).toBeUndefined();
    expect(bringBackCommand('x', 'win32')).toBeUndefined();
  });
});
