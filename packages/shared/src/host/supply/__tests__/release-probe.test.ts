import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEDGER_READ_TIMEOUT_MS,
  VERSION_CHECK_FAILURE_TTL_MS,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '../../../config/constants.js';
import { createFakeShell } from '../../../testing/host-fakes.js';
import { candidatesOf, createReleaseProbe } from '../release-probe.js';
import { createSeam } from '../../seam/run.js';

const ROOT = join(tmpdir(), 'dsh-wb-release-probe');
const REGISTRY = 'https://r.example';
const START = 1_700_000_000_000;

let clock = START;

type Replies = Parameters<typeof createFakeShell>[0];

function viewsOf(fake: { calls: readonly { command?: string | undefined }[] }) {
  return fake.calls.filter((call) => {
    const line = String(call.command ?? '');
    return !line.includes('dist.tarball') && !/'[^']*@[0-9]/.test(line);
  });
}

function harness(replies: Replies, input: { headOk?: boolean; tarballReadable?: boolean } = {}) {
  const headOk = input.headOk ?? true;
  const tarballReadable = input.tarballReadable ?? true;
  let plain = 0;
  const fake = createFakeShell((call) => {
    const line = String(call.command ?? '');
    const pinned = /@([0-9][^'"\s]*)/.exec(line)?.[1];
    if (line.includes('dist.tarball')) {
      return tarballReadable ? { stdout: `https://r.example/pkg-${pinned ?? 'x'}.tgz\n` } : {};
    }
    if (pinned !== undefined && line.includes(' version')) return { stdout: `${pinned}\n` };
    const at = plain;
    plain += 1;
    return typeof replies === 'function' ? replies(call, at) : (((replies ?? [])[at] ?? {}) as never);
  });
  const head = async (): Promise<boolean> => headOk;
  return {
    fake,
    probe: createReleaseProbe({ head }),
    seam: createSeam({ shell: fake.shell, runtimeRoot: ROOT }),
  };
}

beforeEach(() => {
  clock = START;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('某一版的 engines / peers 自己问：市场据此判兼容', () => {
  it('★ 解析成清单字段；同一版第二次直接走缓存', async () => {
    const { probe, seam, fake } = harness((call) =>
      String(call.command).includes('engines')
        ? { stdout: JSON.stringify({ name: 'p', version: '1.2.3', engines: { dsh: '>=0.2.3' } }) }
        : {},
    );

    const manifest = await probe.versionManifestOf({ seam, name: 'p', version: '1.2.3', registry: REGISTRY });
    expect(manifest).toEqual({ name: 'p', version: '1.2.3', engines: { dsh: '>=0.2.3' } });

    const again = await probe.versionManifestOf({ seam, name: 'p', version: '1.2.3', registry: REGISTRY });
    expect(again).toEqual(manifest);
    expect(fake.calls.filter((call) => String(call.command).includes('engines'))).toHaveLength(1);
  });

  it('★ 问不到就是 undefined（调用方据此给「未验证」，不假装兼容）', async () => {
    const { probe, seam } = harness(() => ({}));

    expect(await probe.versionManifestOf({ seam, name: 'q', version: '9.9.9', registry: REGISTRY })).toBeUndefined();
  });
});

describe('查新版那一次网络请求', () => {
  it('★ 按 registry 问一次、拿网络那档超时，不是本地账本那档', async () => {
    const { fake, probe, seam } = harness([{ stdout: '1.1.5\n' }]);

    await expect(probe.latestVersion({ seam, name: '@a/mod', registry: REGISTRY })).resolves.toBe('1.1.5');

    expect(viewsOf(fake)).toHaveLength(1);
    expect(fake.calls[0]?.command).toContain('npm view');
    expect(fake.calls[0]?.command).toContain('@a/mod');
    expect(fake.calls[0]?.command).toContain(REGISTRY);
    expect(fake.calls[0]?.timeoutMs).toBe(VERSION_CHECK_TIMEOUT_MS);
    expect(VERSION_CHECK_TIMEOUT_MS).toBeGreaterThan(LEDGER_READ_TIMEOUT_MS);
  });

  it('查到了就在 TTL 内不再问；过了 TTL 才重问', async () => {
    const { fake, probe, seam } = harness([{ stdout: '1.1.5\n' }, { stdout: '1.1.5\n' }]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(viewsOf(fake)).toHaveLength(1);

    vi.setSystemTime(clock + VERSION_CHECK_TTL_MS);
    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(viewsOf(fake)).toHaveLength(2);
  });

  it('★ npm 不在（Desktop 的 node 不带 npm）→ 退到宿主那份 pnpm 再问一次', async () => {
    const { fake, probe, seam } = harness([
      { exitCode: 127, stderr: 'npm: command not found' },
      { stdout: '1.1.5\n' },
    ]);

    await expect(probe.latestVersion({ seam, name: '@a/mod', registry: REGISTRY })).resolves.toBe('1.1.5');

    expect(viewsOf(fake)).toHaveLength(2);
    expect(fake.calls[0]?.command).toContain('npm view');
    expect(fake.calls[1]?.command).toContain('view');
    expect(fake.calls[1]?.command).toContain('@a/mod');
  });

  it('★ 一次超时只锁一分钟：两条命令都失败后，慢源回过神来的下一次就能把版本拿回来', async () => {
    const { fake, probe, seam } = harness([
      { exitCode: 1, stderr: 'ETIMEDOUT' },
      { exitCode: 1, stderr: 'ETIMEDOUT' },
      { stdout: '1.1.5\n' },
    ]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    expect(VERSION_CHECK_FAILURE_TTL_MS).toBeLessThan(VERSION_CHECK_TTL_MS);

    expect(await probe.latestVersion(options)).toBeUndefined();
    expect(await probe.latestVersion(options)).toBeUndefined();
    expect(viewsOf(fake)).toHaveLength(2);

    vi.setSystemTime(clock + VERSION_CHECK_FAILURE_TTL_MS);
    expect(await probe.latestVersion(options)).toBe('1.1.5');
    expect(viewsOf(fake)).toHaveLength(3);
  });

  it('force 绕开缓存：失败的那一分钟也拦不住用户按那一颗 ⟳', async () => {
    const { fake, probe, seam } = harness([
      { exitCode: 1 },
      { exitCode: 1 },
      { stdout: '2.0.0\n' },
    ]);
    const options = { seam, name: '@a/mod', registry: REGISTRY } as const;

    expect(await probe.latestVersion(options)).toBeUndefined();
    expect(await probe.latestVersion({ ...options, force: true })).toBe('2.0.0');
    expect(viewsOf(fake)).toHaveLength(3);
  });
});

describe('本地账本与「有没有这一版」', () => {
  it('`npm ls` 那跳按本地那档超时收，不等网络', async () => {
    const { fake, probe, seam } = harness([
      { stdout: JSON.stringify({ dependencies: { '@a/mod': { version: '1.1.4' } } }) },
    ]);

    await expect(probe.probeRelease({ seam, package: '@a/mod', check: false })).resolves.toEqual({
      installed: '1.1.4',
    });
    expect(fake.calls[0]?.command).toContain('npm ls');
    expect(fake.calls[0]?.timeoutMs).toBe(LEDGER_READ_TIMEOUT_MS);
  });

  it('「这一版没有」也是失败：只锁一分钟，不按成功那档锁十分钟', async () => {
    const { fake, probe, seam } = harness(() => ({ exitCode: 1 }), { headOk: false });
    const options = { seam, name: '@a/mod', version: '1.0.0', registry: REGISTRY } as const;

    await probe.missingReleaseParts(options);
    const first = fake.calls.length;
    expect(first).toBeGreaterThan(0);

    await probe.missingReleaseParts(options);
    expect(fake.calls).toHaveLength(first);

    vi.setSystemTime(clock + VERSION_CHECK_FAILURE_TTL_MS);
    await probe.missingReleaseParts(options);
    expect(fake.calls.length).toBeGreaterThan(first);
  });
});

describe('检测结果以 tarball 为准，不只信 npm view', () => {
  it('★ 元数据说有这一版，但 tarball 拉不到 → 不算有新版本', async () => {
    const { probe, seam } = harness([{ stdout: '1.2.0\n' }], { headOk: false });

    await expect(probe.latestVersion({ seam, name: '@a/mod', registry: REGISTRY })).resolves.toBeUndefined();
  });

  it('★ tarball 拉得到 → 才算有新版本', async () => {
    const { probe, seam } = harness([{ stdout: '1.2.0\n' }]);

    await expect(probe.latestVersion({ seam, name: '@a/mod', registry: REGISTRY })).resolves.toBe('1.2.0');
  });

  it('★ 候选版本里最新的那个 tarball 没铺开 → 退到下一个能装的', async () => {
    const { seam } = harness([{ stdout: JSON.stringify(['1.3.0', '1.2.0']) }]);
    const seen: string[] = [];
    const withHoles = createReleaseProbe({
      head: async (url) => {
        seen.push(url);
        return !url.includes('1.3.0');
      },
    });

    await expect(
      withHoles.latestVersion({ seam, name: '@a/mod', registry: REGISTRY, prereleaseChannels: ['rc'] }),
    ).resolves.toBe('1.2.0');
    expect(seen.some((url) => url !== '')).toBe(true);
  });

  it('★ 发布没铺齐（有包 tarball 拉不到）→ 报缺哪一个', async () => {
    const { probe, seam } = harness(() => ({ stdout: 'https://r.example/x.tgz\n' }));

    await expect(
      probe.missingReleaseParts({ seam, name: '@a/mod', version: '1.0.0', registry: REGISTRY }),
    ).resolves.toEqual([]);
  });
});

describe('candidatesOf', () => {
  it('★ 只取选中的通道；候选按版本从高到低排（正式版照进）', () => {
    expect(
      candidatesOf(JSON.stringify(['1.0.0', '1.1.0-beta.0', '1.2.0-rc.0', '1.1.0']), ['rc']),
    ).toEqual(['1.2.0-rc.0', '1.1.0', '1.0.0']);
    expect(
      candidatesOf(JSON.stringify(['1.0.0', '1.3.0-beta.1', '1.2.0-rc.0']), ['beta']),
    ).toEqual(['1.3.0-beta.1', '1.0.0']);
    expect(
      candidatesOf(JSON.stringify(['1.0.0', '1.3.0-beta.1', '1.2.0-rc.0']), ['beta', 'rc']),
    ).toEqual(['1.3.0-beta.1', '1.2.0-rc.0', '1.0.0']);
  });

  it('全不选时只有稳定版；没铺开时也没有候选', () => {
    expect(candidatesOf(JSON.stringify(['1.1.0-beta.0']), [])).toEqual([]);
    expect(candidatesOf('1.1.0-beta.0\n', [])).toEqual(['1.1.0-beta.0']);
    expect(candidatesOf('1.1.0\n', [])).toEqual(['1.1.0']);
  });
});

describe('私有源的 HEAD 要带 npm 自己的凭据', () => {
  it('★ npmrc 里配了 token → HEAD 带上它，新版才认', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-release-head-'));
    const file = join(dir, '.npmrc');
    writeFileSync(file, '//r.example/:_authToken=secret\n');
    vi.stubEnv('NPM_CONFIG_USERCONFIG', file);
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>(
      async () => ({ ok: true, status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeShell((call) => {
      const line = String(call.command ?? '');
      return line.includes('dist.tarball')
        ? { stdout: 'https://r.example/pkg-1.1.0.tgz\n' }
        : { stdout: '1.1.0\n' };
    });
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });

    try {
      await expect(
        createReleaseProbe().latestVersion({ seam, name: '@a/mod', registry: REGISTRY }),
      ).resolves.toBe('1.1.0');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://r.example/pkg-1.1.0.tgz',
        expect.objectContaining({ method: 'HEAD', headers: { authorization: 'Bearer secret' } }),
      );
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ 没有配凭据就不发 Authorization', async () => {
    vi.stubEnv('NPM_CONFIG_USERCONFIG', join(tmpdir(), 'dsh-wb-missing-npmrc'));
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>(
      async () => ({ ok: true, status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeShell((call) => {
      const line = String(call.command ?? '');
      return line.includes('dist.tarball')
        ? { stdout: 'https://r.example/pkg-1.1.0.tgz\n' }
        : { stdout: '1.1.0\n' };
    });
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });

    try {
      await expect(
        createReleaseProbe().latestVersion({ seam, name: '@a/mod', registry: REGISTRY }),
      ).resolves.toBe('1.1.0');
      expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('headers');
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});

describe('鉴权拿不到时的兜底', () => {
  it('★ 没有凭据、HEAD 401 → 以 npm view 的结果为准', async () => {
    vi.stubEnv('NPM_CONFIG_USERCONFIG', join(tmpdir(), 'dsh-wb-missing-npmrc'));
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>(
      async () => ({ ok: false, status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeShell((call) => {
      const line = String(call.command ?? '');
      return line.includes('dist.tarball')
        ? { stdout: 'https://r.example/pkg-1.1.0.tgz\n' }
        : { stdout: '1.1.0\n' };
    });
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });

    try {
      await expect(
        createReleaseProbe().latestVersion({ seam, name: '@a/mod', registry: REGISTRY }),
      ).resolves.toBe('1.1.0');
      expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('headers');
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('★ 凭据被拒（403）也算验证不了 → 仍以 npm view 为准', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-release-head-'));
    const file = join(dir, '.npmrc');
    writeFileSync(file, '//r.example/:_authToken=secret\n');
    vi.stubEnv('NPM_CONFIG_USERCONFIG', file);
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>(
      async () => ({ ok: false, status: 403 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeShell((call) => {
      const line = String(call.command ?? '');
      return line.includes('dist.tarball')
        ? { stdout: 'https://r.example/pkg-1.1.0.tgz\n' }
        : { stdout: '1.1.0\n' };
    });
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });

    try {
      await expect(
        createReleaseProbe().latestVersion({ seam, name: '@a/mod', registry: REGISTRY }),
      ).resolves.toBe('1.1.0');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://r.example/pkg-1.1.0.tgz',
        expect.objectContaining({ headers: { authorization: 'Bearer secret' } }),
      );
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('★ 明确 404 → 还是不算有新版本', async () => {
    vi.stubEnv('NPM_CONFIG_USERCONFIG', join(tmpdir(), 'dsh-wb-missing-npmrc'));
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>>(
      async () => ({ ok: false, status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const fake = createFakeShell((call) => {
      const line = String(call.command ?? '');
      return line.includes('dist.tarball')
        ? { stdout: 'https://r.example/pkg-1.1.0.tgz\n' }
        : { stdout: '1.1.0\n' };
    });
    const seam = createSeam({ shell: fake.shell, runtimeRoot: ROOT });

    try {
      await expect(
        createReleaseProbe().latestVersion({ seam, name: '@a/mod', registry: REGISTRY }),
      ).resolves.toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
