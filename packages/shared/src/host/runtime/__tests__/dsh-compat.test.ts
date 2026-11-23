import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dshCompatibilityOf, dshRequirementsOf, dshVersionIn } from '../dsh-compat.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-dsh-compat-'));

beforeEach(() => {
  vi.stubEnv('DSH_VERSION', '');
  vi.stubEnv('DSH_CLIENT_VERSION', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const verdictOf = (manifest: Parameters<typeof dshRequirementsOf>[0], dshVersion?: string) =>
  dshCompatibilityOf({ requirements: dshRequirementsOf(manifest), dshVersion });

describe('dsh 兼容判定：engines 优先，再看 dsh peers', () => {
  it('engines.dsh 高于当前 dsh → 不兼容；等于或低于 → 兼容', () => {
    const manifest = { name: '@dsh-workbench/core', engines: { dsh: '>=0.2.2-rc.2' } };
    expect(verdictOf(manifest, '0.2.2-rc.1').verdict).toBe('incompatible');
    expect(verdictOf(manifest, '0.2.2-rc.2').verdict).toBe('compatible');
    expect(verdictOf(manifest, '0.3.0').verdict).toBe('compatible');
  });

  it('预发布边界按原样比较，不把 rc.1 当成 rc.2', () => {
    const manifest = { name: 'x', engines: { dsh: '>=0.2.2-rc.2' } };
    const verdict = verdictOf(manifest, '0.2.2-rc.1');
    expect(verdict).toMatchObject({ verdict: 'incompatible' });
    if (verdict.verdict === 'incompatible') expect(verdict.requirements[0]?.range).toBe('>=0.2.2-rc.2');
  });

  it('有 engines 就只看 engines，peer 的区间不再参与', () => {
    const manifest = {
      name: 'x',
      engines: { dsh: '>=0.2.0' },
      peerDependencies: { '@deepseek-ai/dsh': '^0.9.0' },
    };
    expect(verdictOf(manifest, '0.2.2').verdict).toBe('compatible');
  });

  it('没有 engines：peer 只收 dsh 那几个、别的不算；但 peer 不能判兼容', () => {
    const manifest = {
      name: 'x',
      peerDependencies: {
        '@deepseek-ai/dsh': '>=0.2.0',
        '@deepseek-ai/dsh-web': '>=0.2.0',
        '@deepseek-ai/other': '^9.0.0',
      },
    };
    expect(dshRequirementsOf(manifest).map((item) => item.range)).toEqual(['>=0.2.0', '>=0.2.0']);
    expect(verdictOf(manifest, '0.2.2')).toMatchObject({ verdict: 'unknown', reason: 'peer-only' });
  });

  it('★ peer 钉的是那个包的版本，不是 dsh 的版本：精确钉旧 rc 也不判不兼容', () => {
    const manifest = {
      name: '@dsh-workbench/shared',
      peerDependencies: { '@deepseek-ai/dsh-client-ui-primitives': '0.2.2-rc.2' },
    };
    expect(verdictOf(manifest, '0.2.2-rc.5')).toMatchObject({ verdict: 'unknown', reason: 'peer-only' });
  });

  it('拿不到 dsh 版本 / 区间非法 / 没写要求 → 都是未知，不假装兼容', () => {
    const manifest = { name: 'x', engines: { dsh: '>=0.2.0' } };
    expect(verdictOf(manifest)).toMatchObject({ verdict: 'unknown', reason: 'missing-dsh-version' });
    expect(verdictOf(manifest, 'not-a-version')).toMatchObject({ verdict: 'unknown', reason: 'missing-dsh-version' });
    expect(verdictOf({ name: 'x', engines: { dsh: 'nonsense range' } }, '0.2.2')).toMatchObject({
      verdict: 'unknown',
      reason: 'malformed',
    });
    expect(verdictOf({ name: 'x' }, '0.2.2')).toMatchObject({ verdict: 'unknown', reason: 'no-requirement' });
  });
});

describe('dsh 版本从 profile 的安装锚点读', () => {
  function profileWith(files: Readonly<Record<string, unknown>>): string {
    const dir = mkdtempSync(join(ROOT, 'profile-'));
    for (const [rel, body] of Object.entries(files)) {
      const file = join(dir, rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    }
    return dir;
  }

  it('优先读实际安装的 dsh 清单；没有才退回锚点钉住的版本', () => {
    const dir = profileWith({
      'node_modules/@deepseek-ai/dsh/package.json': { name: '@deepseek-ai/dsh', version: '0.2.2-rc.5' },
      'node_modules/@deepseek-ai/dsh-app-boot/package.json': {
        name: '@deepseek-ai/dsh-app-boot',
        version: '0.2.2-rc.2',
        dependencies: { '@deepseek-ai/dsh': '0.2.2-rc.2' },
      },
    });
    expect(dshVersionIn(dir)).toBe('0.2.2-rc.5');

    const anchored = profileWith({
      'node_modules/@deepseek-ai/dsh-app-boot/package.json': {
        name: '@deepseek-ai/dsh-app-boot',
        version: '0.2.2-rc.2',
        dependencies: { '@deepseek-ai/dsh': '0.2.2-rc.2' },
      },
    });
    expect(dshVersionIn(anchored)).toBe('0.2.2-rc.2');
  });

  it('只有 dsh 清单时读它自己的版本；都读不到就是 undefined', () => {
    const dir = profileWith({
      'node_modules/@deepseek-ai/dsh/package.json': { name: '@deepseek-ai/dsh', version: '0.2.2-rc.1' },
    });
    expect(dshVersionIn(dir)).toBe('0.2.2-rc.1');
    expect(dshVersionIn(join(ROOT, 'nothing-here'))).toBeUndefined();
  });

  it('★ 桌面端启动器塞进来的 DSH_CLIENT_VERSION 优先：它才是正在跑的那份 dsh', () => {
    const dir = profileWith({
      'node_modules/@deepseek-ai/dsh/package.json': { name: '@deepseek-ai/dsh', version: '0.2.3-alpha.2' },
    });
    vi.stubEnv('DSH_CLIENT_VERSION', '0.2.2-rc.5');

    expect(dshVersionIn(dir)).toBe('0.2.2-rc.5');

    vi.stubEnv('DSH_CLIENT_VERSION', 'garbage');
    expect(dshVersionIn(dir)).toBe('0.2.3-alpha.2');
  });

  it('★ dsh 装在 profile 的上一层（~/.dsh/profiles/node_modules）也认', () => {
    const parent = profileWith({
      'node_modules/@deepseek-ai/dsh/package.json': { name: '@deepseek-ai/dsh', version: '0.2.3-alpha.2' },
    });
    const child = join(parent, 'workbench');
    mkdirSync(child, { recursive: true });

    expect(dshVersionIn(child)).toBe('0.2.3-alpha.2');
  });

  it('profile 里都没有时用启动器导出的 DSH_VERSION；非法值忽略', () => {
    const dir = profileWith({});
    vi.stubEnv('DSH_VERSION', '0.2.3');
    expect(dshVersionIn(dir)).toBe('0.2.3');

    vi.stubEnv('DSH_VERSION', 'garbage');
    expect(dshVersionIn(dir)).toBeUndefined();
  });
});
