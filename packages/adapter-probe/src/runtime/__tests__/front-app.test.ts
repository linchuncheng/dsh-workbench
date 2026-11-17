import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createSeam } from '@dsh-workbench/shared/host';
import { bringBackWindow, frontAppNow } from '../front-app.js';

function seamOf(replies: { readonly stdout?: string; readonly exitCode?: number }[]) {
  const fake = createFakeShell(replies);
  return {
    fake,
    seam: createSeam({ shell: fake.shell, runtimeRoot: '/tmp/wb-front-app' }),
  };
}

describe('前台应用：问 OS 与带回', () => {
  it('★ 问出前台应用名（macOS 上就是 System Events 那一行）', async () => {
    const { seam } = seamOf([{ stdout: 'Finder\nDeepSeek Harness\n' }]);

    expect(await frontAppNow(seam)).toBe('DeepSeek Harness');
  });

  it('★ 带回：命令跑通才算真带回', async () => {
    const { fake, seam } = seamOf([{}]);

    expect(await bringBackWindow(seam, 'DeepSeek Harness')).toBe(true);
    expect(fake.calls).toHaveLength(1);
  });

  it('★ 命令失败 → false，不假装成功', async () => {
    const { seam } = seamOf([{ exitCode: 1 }]);

    expect(await bringBackWindow(seam, 'DeepSeek Harness')).toBe(false);
  });

  it('★ 问不出来 → undefined，不猜', async () => {
    const { seam } = seamOf([{ stdout: '' }]);

    expect(await frontAppNow(seam)).toBeUndefined();
  });
});
