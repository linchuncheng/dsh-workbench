import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { browserExtensionInputOf, shippedAdapterSetSpec } from '@/shared/api/host/shipped-adapter-set';

const roots: string[] = [];

function packageAt(manifest: unknown): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-adapter-set-'));
  roots.push(root);
  mkdirSync(join(root, 'src', 'app'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest), 'utf8');
  return pathToFileURL(join(root, 'src', 'app', 'host.ts')).href;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('shippedAdapterSetSpec', () => {
  it('★ 读 package.json 的 workbench.adapterSet（外壳装哪份适配器集合只写一处）', () => {
    expect(shippedAdapterSetSpec(packageAt({ workbench: { adapterSet: ' @dsh-workbench/adapters-default ' } }))).toBe(
      '@dsh-workbench/adapters-default',
    );
  });

  it('没写或写空时直接报错（不留一个静默的默认值）', () => {
    expect(() => shippedAdapterSetSpec(packageAt({ workbench: {} }))).toThrow('workbench.adapterSet');
    expect(() => shippedAdapterSetSpec(packageAt({ workbench: { adapterSet: '  ' } }))).toThrow('workbench.adapterSet');
  });
});
describe('browserExtensionInputOf', () => {
  it('★ 适配器没有这个能力 → 不给预检塞空壳', () => {
    expect(browserExtensionInputOf({}, {} as never)).toEqual({});
  });

  it('★ 正常转交目录与版本', () => {
    const found = { dir: '/opt/ext', version: '1.0.27', source: 'bundled' as const };
    const input = browserExtensionInputOf({ browserExtension: () => found }, {} as never);

    expect(input.extension?.()).toEqual(found);
  });

  it('★ 读目录抛错 → 当作没有，并记一条 warn（不让整轮预检变 failed）', () => {
    const warns: string[] = [];
    const input = browserExtensionInputOf(
      {
        browserExtension: () => {
          throw new Error('boom');
        },
      },
      { logger: { warn: (message: string) => warns.push(message) } } as never,
    );

    expect(input.extension?.()).toBeUndefined();
    expect(warns.join('\n')).toContain('读取浏览器扩展目录失败');
  });
});
