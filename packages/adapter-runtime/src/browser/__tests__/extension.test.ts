import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { browserExtensionOf } from '../extension.js';

const roots: string[] = [];

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ext-'));
  roots.push(dir);
  return dir;
}

function extensionAt(dir: string, version: string, extra: Readonly<Record<string, string>> = {}): string {
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, version }));
  writeFileSync(join(dir, 'dist', 'background.js'), 'console.log(1);\n');
  for (const [rel, text] of Object.entries(extra)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('browserExtensionOf', () => {
  it('★ 默认取包内 vendor/browser-extension：随包副本确实在这个包里', () => {
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../vendor/browser-extension/manifest.json', import.meta.url)), 'utf8'),
    ) as { readonly version: string };
    const stable = join(temp(), 'extension');

    const found = browserExtensionOf({ env: {}, stableDir: stable });

    expect(found).toEqual({ dir: stable, version: manifest.version, source: 'bundled' });
    expect(existsSync(join(stable, 'dist', 'background.js'))).toBe(true);
  });

  it('★ 首次：把随包副本落到稳定目录，给出路径、版本和来源', () => {
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');

    const found = browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });

    expect(found).toEqual({ dir: stable, version: '1.0.27', source: 'bundled' });
    expect(readFileSync(join(stable, 'manifest.json'), 'utf8')).toContain('1.0.27');
    expect(existsSync(join(stable, 'dist', 'background.js'))).toBe(true);
  });

  it('★ 版本没变、文件齐 → 一个字节不写（多出来的哨兵文件还在）', () => {
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');
    browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });
    writeFileSync(join(stable, 'sentinel.txt'), 'keep');

    const again = browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });

    expect(again).toEqual({ dir: stable, version: '1.0.27', source: 'bundled' });
    expect(existsSync(join(stable, 'sentinel.txt'))).toBe(true);
  });

  it('★ 随包版本变了 → 内容刷新、路径不变', () => {
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');
    browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });
    extensionAt(bundled, '1.0.28', { 'popup.html': '<html></html>' });

    const found = browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });

    expect(found).toEqual({ dir: stable, version: '1.0.28', source: 'bundled' });
    expect(existsSync(join(stable, 'popup.html'))).toBe(true);
  });

  it('★ 稳定目录缺文件 → 启动时自愈', () => {
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');
    browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });
    rmSync(join(stable, 'dist', 'background.js'));

    const found = browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });

    expect(found?.version).toBe('1.0.27');
    expect(existsSync(join(stable, 'dist', 'background.js'))).toBe(true);
  });

  it('★ 稳定目录里的版本过期但文件齐 → 仍然重建（判据是版本）', () => {
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');
    browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });
    writeFileSync(join(stable, 'manifest.json'), JSON.stringify({ manifest_version: 3, version: '1.0.20' }));

    const found = browserExtensionOf({ env: {}, bundledDir: bundled, stableDir: stable });

    expect(found?.version).toBe('1.0.27');
  });

  it('★ 环境变量指到有效目录 → 直接用、不复制、不碰稳定目录', () => {
    const asked = extensionAt(join(temp(), 'mine'), '1.0.99');
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');

    const found = browserExtensionOf({
      env: { DSH_WB_OPENCLI_EXTENSION: asked },
      bundledDir: bundled,
      stableDir: stable,
    });

    expect(found).toEqual({ dir: asked, version: '1.0.99', source: 'env' });
    expect(existsSync(stable)).toBe(false);
  });

  it('★ 环境变量指到没有 manifest 的目录 → 退回随包副本并记一条日志', () => {
    const empty = temp();
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');
    const logs: string[] = [];

    const found = browserExtensionOf({
      env: { DSH_WB_OPENCLI_EXTENSION: empty },
      bundledDir: bundled,
      stableDir: stable,
      log: (message) => logs.push(message),
    });

    expect(found).toEqual({ dir: stable, version: '1.0.27', source: 'bundled' });
    expect(logs.join('\n')).toContain('DSH_WB_OPENCLI_EXTENSION');
  });

  it('★ 随包副本不在、稳定目录也不在 → undefined，不抛', () => {
    const stable = join(temp(), 'extension');

    const found = browserExtensionOf({ env: {}, bundledDir: join(temp(), 'nope'), stableDir: stable });

    expect(found).toBeUndefined();
  });

  it('★ 拿不到锁 → 不抛，也不写出半截目录', () => {
    const bundled = extensionAt(join(temp(), 'bundled'), '1.0.27');
    const stable = join(temp(), 'extension');
    mkdirSync(`${stable}.lock`);
    const logs: string[] = [];

    const found = browserExtensionOf({
      env: {},
      bundledDir: bundled,
      stableDir: stable,
      log: (message) => logs.push(message),
    });

    expect(found).toBeUndefined();
    expect(logs.length).toBeGreaterThan(0);
  });
});
