import { describe, expect, it } from 'vitest';
import { dshBlockOf, judgedBlockOf, updateBlockOf, visibleVersions } from '../bundle-version-blocks';

describe('版本块：谁算新、谁被拦', () => {
  it('★ 没选通道只认正式版；选了通道就只认那个通道', () => {
    const versions = [
      { version: '1.0.0', prerelease: false },
      { version: '1.1.0-beta.1', prerelease: true },
      { version: '1.2.0-rc.1', prerelease: true },
    ];

    expect(visibleVersions(versions, []).map((entry) => entry.version)).toEqual(['1.0.0']);
    expect(visibleVersions(versions, ['beta']).map((entry) => entry.version)).toEqual(['1.1.0-beta.1']);
    expect(visibleVersions(versions, ['beta', 'rc']).map((entry) => entry.version)).toEqual([
      '1.1.0-beta.1',
      '1.2.0-rc.1',
    ]);
  });

  it('★ 协议比这一版工作台新 → 要更新工作台；别的问题 → 不兼容；没问题 → 不拦', () => {
    expect(updateBlockOf({ apiVersion: 99 }, ['缺卡片'])).toEqual({ kind: 'needs-workbench' });
    expect(updateBlockOf({ apiVersion: 1 }, ['缺卡片'])).toEqual({ kind: 'incompatible' });
    expect(updateBlockOf({ apiVersion: 1 }, [])).toBeUndefined();
  });

  it('★ 官方版本表说这一版不兼容 → 连要求与当前 dsh 一起带出去；没说 → 不拦', () => {
    expect(dshBlockOf(undefined)).toBeUndefined();
    expect(
      dshBlockOf({
        name: '@dsh-workbench/core',
        version: '1.5.0',
        runtimeVersion: '0.2.2-rc.5',
        requirements: { 'engines.dsh': '>=0.2.3-alpha.2' },
      }),
    ).toEqual({
      kind: 'incompatible',
      requirements: { 'engines.dsh': '>=0.2.3-alpha.2' },
      runtimeVersion: '0.2.2-rc.5',
    });
  });

  it('★ 只按 engines.dsh 判：peer 钉的 dsh 包版本（rc.2）不算「需要 dsh rc.2」', async () => {
    const supply = {
      versionManifestOf: async () => ({
        name: '@dsh-workbench/core',
        engines: { dsh: '>=0.2.2-rc.2' },
        peerDependencies: { '@deepseek-ai/dsh-client-ui-primitives': '0.2.2-rc.2' },
      }),
    } as never;

    await expect(
      judgedBlockOf(supply, {
        seam: {} as never,
        name: '@dsh-workbench/core',
        version: '1.5.2-alpha.3',
        registry: 'https://registry.npmjs.org/',
        force: false,
        dshVersion: '0.2.2-rc.5',
      }),
    ).resolves.toBeUndefined();
  });

  it('★ 自己判：缺 seam / registry / 运行版本 → 只说未验证，不假装兼容', async () => {
    const supply = {
      versionManifestOf: async () => {
        throw new Error('这里不该被问到');
      },
    } as never;

    await expect(
      judgedBlockOf(supply, {
        seam: undefined,
        name: '@dsh-workbench/core',
        version: '1.5.2-alpha.2',
        registry: 'https://registry.npmjs.org/',
        force: false,
        dshVersion: '0.2.2-rc.5',
      }),
    ).resolves.toEqual({ kind: 'unverified' });
    await expect(
      judgedBlockOf(supply, {
        seam: {} as never,
        name: '@dsh-workbench/core',
        version: '1.5.2-alpha.2',
        registry: 'https://registry.npmjs.org/',
        force: false,
        dshVersion: undefined,
      }),
    ).resolves.toEqual({ kind: 'unverified' });
  });
});
