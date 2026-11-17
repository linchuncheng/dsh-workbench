import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createSeam } from '@dsh-workbench/shared/host';
import { bringBackWindow, frontAppNow, isBrowserApp, rememberFrontApp, restoreFocus } from '../front-app.js';

function seamOf(replies: { readonly stdout?: string; readonly exitCode?: number }[]) {
  const fake = createFakeShell(replies);
  return {
    fake,
    seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-front-app' }),
  };
}

describe('前台应用：问 OS 与带回', () => {
  it('★ 问出前台应用名（macOS 上就是 System Events 那一行）', async () => {
    const { seam } = seamOf([{ stdout: 'bundleID="com.deepseek.harness"\n' }]);

    expect(await frontAppNow(seam, 'darwin')).toBe('com.deepseek.harness');
  });

  it('★ 带回：命令跑通才算真带回', async () => {
    const { fake, seam } = seamOf([{}]);

    expect(await bringBackWindow(seam, 'com.deepseek.harness', 'darwin')).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it('★ 命令失败 → false，不假装成功', async () => {
    const { seam } = seamOf([{ exitCode: 1 }]);

    expect(await bringBackWindow(seam, 'com.deepseek.harness', 'darwin')).toBe(false);
  });

  it('★ 问不出来 → undefined，不猜', async () => {
    const { seam } = seamOf([{ stdout: '' }]);

    expect(await frontAppNow(seam, 'darwin')).toBeUndefined();
  });
});

describe('前台是浏览器时，记住的是那一页（不是整个浏览器）', () => {
  function seamOfMany(replies: { readonly stdout?: string; readonly exitCode?: number }[]) {
    const fake = createFakeShell([...replies]);
    return { fake, seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-front-app-2' }) };
  }

  const FRONT_CHROME = { stdout: 'bundleID="com.google.Chrome"\n' };
  const WINDOWS = {
    stdout: JSON.stringify({
      ok: true,
      data: [
        { id: 11, focused: false },
        { id: 22, focused: true },
      ],
    }),
  };
  const TAB = { stdout: JSON.stringify({ ok: true, data: [{ id: 2201, active: true, windowId: 22 }] }) };

  it('★ 记下前台浏览器里当前那一页', async () => {
    const { seam } = seamOfMany([FRONT_CHROME, WINDOWS, TAB]);

    expect(await rememberFrontApp(seam, 'opencli', 'darwin')).toBe('com.google.Chrome');
  });

  it('★ 还原时先激活那一页、再把那个窗口提到前面（不猜「浏览器整个」）', async () => {
    const { fake, seam } = seamOfMany([FRONT_CHROME, WINDOWS, TAB, {}, {}]);

    await rememberFrontApp(seam, 'opencli', 'darwin');
    expect(await restoreFocus(seam, 'opencli', 'com.google.Chrome', 'darwin')).toBe(true);

    const lines = fake.calls.map((call) => (call as { command?: string }).command ?? '');
    expect(lines.join('\n')).toContain('tabs.update');
    expect(lines.join('\n')).toContain('windows.update');
    expect(lines.join('\n')).toContain('2201');
    expect(lines.join('\n')).toContain('22');
  });

  it('★ 前台不是浏览器（桌面应用）→ 还是走应用级的带回', async () => {
    const { fake, seam } = seamOfMany([{ stdout: 'bundleID="com.deepseek.harness"\n' }, {}]);

    await rememberFrontApp(seam, 'opencli', 'darwin');
    expect(await restoreFocus(seam, 'opencli', 'com.deepseek.harness', 'darwin')).toBe(true);

    const lines = fake.calls.map((call) => (call as { command?: string }).command ?? '');
    expect(lines.join('\n')).not.toContain('tabs.update');
    expect(lines.join('\n')).toContain('open -b');
  });

  it('★ 浏览器名字认得出来（Chrome / Edge / Brave / Vivaldi / Chromium）', () => {
    expect(isBrowserApp('Google Chrome')).toBe(true);
    expect(isBrowserApp('com.google.Chrome')).toBe(true);
    expect(isBrowserApp('com.microsoft.edgemac')).toBe(true);
    expect(isBrowserApp('com.brave.Browser')).toBe(true);
    expect(isBrowserApp('Google Chrome')).toBe(true);
    expect(isBrowserApp('com.deepseek.harness')).toBe(false);
  });
});
