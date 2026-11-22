import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { fakeSeamOf } from './seam-fake';
import { unitTitleKey } from '@dsh-workbench/shared';
import type { SupplySource, UnitManifest } from '@dsh-workbench/shared';
import { pendingBuildsOf, recordPendingBuilds } from '@dsh-workbench/shared/host';
import type { NeedState, UnitCapability } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';

const GIT: SupplySource = { kind: 'git', url: 'git@x:demo.git' };

function unit(id: string, plugin = 'demo', sources?: readonly SupplySource[]): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [
      {
        kind: 'extension',
        runtime: 'opencli',
        name: plugin,
        commands: ['x'],
        purpose: '测试',
        ...(sources === undefined ? {} : { sources }),
      },
    ],
  };
}

const uiUnit: UnitManifest = { id: 'panels', titleKey: unitTitleKey('panels'), card: null, tools: [], host: { inject: [] } };

const missingState = (name = 'demo', extra: Partial<NeedState> = {}): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status: 'missing',
  detail: '假探测',
  provision: 'ready',
  command: "'opencli' plugin install 'git@x:demo.git'",
  ...extra,
});

const outdatedState = (name = 'demo', extra: Partial<NeedState> = {}): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status: 'outdated',
  detail: '假探测：缺命令',
  command: "'opencli' plugin update 'demo'",
  ...extra,
});

const okState = (name = 'demo'): NeedState => ({
  id: `extension:${name}`,
  kind: 'extension',
  name,
  status: 'ok',
  detail: '假探测',
});

function probeWith(table: Readonly<Record<string, UnitCapability>>) {
  return vi.fn(
    async (id: string): Promise<UnitCapability> =>
      table[id] ?? { unit: id, status: 'ok', needs: [okState()] },
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createMarketService：目录', () => {
  it('★ 目录不看"有没有依赖要装"：没有 needs 的模块也在目录里', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo', [GIT]), uiUnit],
      probe: probeWith({ issues: { unit: 'issues', status: 'ok', needs: [okState()] } }),
    });

    const entries = (await market.list()).modules;

    expect(entries.map((entry) => entry.unit)).toEqual(['issues', 'panels']);
    expect(entries[0]?.needs.map((need) => need.name)).toEqual(['demo']);
    expect(entries[0]?.capability.status).toBe('ok');
    expect(entries[1]?.needs).toEqual([]);
  });

  it('★ 共用依赖按 need 聚合：两个模块声明同一份 → 一行，usedBy 是那两个', async () => {
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo', [GIT]), unit('builds', 'demo', [GIT])],
      probe: probeWith({}),
    });

    const { shared } = await market.list();

    expect(shared.map((item) => item.id)).toEqual(['extension:demo']);
    expect(shared[0]?.usedBy).toEqual(['issues', 'builds']);
  });
});

describe('createMarketService：install', () => {
  it('★ 本机 link 装的单元不在市场目录里：装依赖照跑，不报「市场里没有这个模块」', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      command: 'opencli',
      manifests: [uiUnit],
      modules: () => [
        { unit: 'argocd', pkg: '@pagoda-dsh-workbench/module-argocd', version: '1.1.9', local: true },
      ],
      probe: probeWith({ argocd: { unit: 'argocd', status: 'missing', needs: [missingState()] } }),
      seam: fakeSeamOf(fake.shell),
    });

    const entry = await market.install('argocd');

    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
    expect(entry.unit).toBe('argocd');
    expect(entry.capability.status).toBe('missing');
  });

  it('★ 刚装完包、单元还没注册：按包声明探，不把「没结论」当「没有依赖」', async () => {
    const profile = mkdtempSync(join(tmpdir(), 'wb-market-profile-'));
    const pkg = '@pagoda-dsh-workbench/module-argocd';
    mkdirSync(join(profile, 'node_modules', pkg), { recursive: true });
    writeFileSync(
      join(profile, 'node_modules', pkg, 'package.json'),
      JSON.stringify({
        name: pkg,
        version: '1.1.9',
        dsh: {
          workbench: {
            apiVersion: 3,
            unit: 'argocd',
            title: { zh: 'ArgoCD', en: 'ArgoCD' },
            card: null,
            tools: [],
            host: { inject: [] },
            needs: [
              {
                kind: 'extension',
                runtime: 'opencli',
                name: 'demo',
                purpose: '测试',
                sources: [{ kind: 'npm', package: 'opencli-plugin-demo' }],
              },
            ],
          },
        },
      }),
      'utf8',
    );
    const fake = createFakeShell([{ stdout: '' }]);
    const probe = vi.fn(
      async (id: string, options?: { readonly force?: boolean; readonly needs?: readonly unknown[] }): Promise<UnitCapability> =>
        options?.needs === undefined || options.needs.length === 0
          ? { unit: id, status: 'unchecked', needs: [], detail: '单元还没注册' }
          : { unit: id, status: 'missing', needs: [missingState()] },
    );
    const market = createMarketService({
      command: 'opencli',
      manifests: [uiUnit],
      modules: () => [{ unit: 'argocd', pkg, version: '1.1.9' }],
      profileDir: profile,
      probe,
      seam: fakeSeamOf(fake.shell),
    });

    const entry = await market.install('argocd');

    expect(probe).toHaveBeenCalledWith('argocd', { force: true, needs: expect.any(Array) });
    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
    expect(entry.needs.map((need) => need.name)).toEqual(['demo']);
    rmSync(profile, { recursive: true, force: true });
  });

  it('★ 探针先给「没结论」→ 重探一次再决定，不把 unchecked 当成「不用装」', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    let calls = 0;
    const probe = vi.fn(async (id: string): Promise<UnitCapability> => {
      calls += 1;
      return calls === 1
        ? { unit: id, status: 'unchecked', needs: [], detail: '还没结论' }
        : { unit: id, status: 'missing', needs: [missingState()] };
    });
    const market = createMarketService({
      command: 'opencli',
      manifests: [unit('issues')],
      probe,
      seam: fakeSeamOf(fake.shell),
    });

    await market.install('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('★ pnpm 拦了构建脚本：记成待批（写 --dir 那本的 allowBuilds），不当作装好了', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-market-policy-'));
    const command = `pnpm add --dir '${dir}' 'opencli-plugin-demo@1.0.0' --allow-build=opencli-plugin-demo`;
    const fake = createFakeShell([
      {
        exitCode: 1,
        stderr: 'ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @jackwener/opencli\nRun "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.\n',
      },
    ]);
    const market = createMarketService({
      command: 'opencli',
      manifests: [unit('issues')],
      probe: probeWith({
        issues: { unit: 'issues', status: 'missing', needs: [missingState('demo', { command, steps: undefined })] },
      }),
      seam: fakeSeamOf(fake.shell),
    });

    await expect(market.install('issues')).rejects.toMatchObject({ code: 'build-blocked', pendingBuilds: ['@jackwener/opencli'] });
    expect(pendingBuildsOf(dir)).toEqual(['@jackwener/opencli']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('★ 批准之后重跑：待批改成允许，pnpm 照跑', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-market-policy-'));
    recordPendingBuilds(dir, 'Ignored build scripts: @jackwener/opencli');
    const command = `pnpm add --dir '${dir}' 'opencli-plugin-demo@1.0.0' --allow-build=opencli-plugin-demo`;
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({
      command: 'opencli',
      manifests: [unit('issues')],
      probe: probeWith({
        issues: { unit: 'issues', status: 'missing', needs: [missingState('demo', { command, steps: undefined })] },
      }),
      seam: fakeSeamOf(fake.shell),
    });

    await market.install('issues', { approvedBuilds: ['@jackwener/opencli'] });

    expect(fake.commands()).toEqual([`pnpm add --dir '${dir}' 'opencli-plugin-demo@1.0.0' --allow-build=opencli-plugin-demo`]);
    expect(pendingBuildsOf(dir)).toEqual([]);
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('true');
    rmSync(dir, { recursive: true, force: true });
  });

  it('★ 装之前**强探** —— 幂等判断不许拿缓存的旧结论', async () => {
    const probe = probeWith({ issues: { unit: 'issues', status: 'missing', needs: [missingState()] } });
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({ command: 'opencli', manifests: [unit('issues')], probe, seam: fakeSeamOf(fake.shell) });

    await market.install('issues');

    expect(probe).toHaveBeenCalledWith('issues', { force: true });
  });

  it('跑探测给出的那条安装命令，并通知装配方', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'missing', needs: [missingState()] } }),
      seam: fakeSeamOf(fake.shell),
      onInstalled,
    });

    await market.install('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin install 'git@x:demo.git'"]);
    expect(onInstalled).toHaveBeenCalledWith('issues');
  });

  it('★ 探测给了计划步骤 → 按步骤跑：可选的那步失败不挡安装（新用户第一次装没有旧插件可卸）', async () => {
    const fake = createFakeShell([
      { exitCode: 1, stderr: 'Plugin "demo" is not installed.' },
      { stdout: '' },
    ]);
    const steps = [
      { kind: 'run' as const, line: "'opencli' plugin uninstall 'demo'", optional: true as const },
      { kind: 'run' as const, line: "'opencli' plugin install '/x/node_modules/demo'" },
    ];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'missing', needs: [missingState('demo', { steps })] } }),
      seam: fakeSeamOf(fake.shell),
    });

    await market.install('issues');

    expect(fake.commands()).toEqual([
      "'opencli' plugin uninstall 'demo'",
      "'opencli' plugin install '/x/node_modules/demo'",
    ]);
  });

  it('本来就能用（幂等早返回）也要通知 —— 用户按的是"安装"，但一条命令都不跑', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'ok', needs: [okState()] } }),
      seam: fakeSeamOf(fake.shell),
      onInstalled,
    });

    await market.install('issues');

    expect(fake.commands()).toEqual([]);
    expect(onInstalled).toHaveBeenCalledWith('issues');
  });

  it('★ 来源解析不出（env-missing）→ 抛，且**一条命令都不跑**', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues', 'demo', [{ kind: 'local', env: 'DSH_WORKBENCH_TEST_UNSET' }])],
      probe: probeWith({
        issues: {
          unit: 'issues',
          status: 'missing',
          needs: [missingState('demo', { provision: 'env-missing' })],
        },
      }),
      seam: fakeSeamOf(fake.shell),
    });

    await expect(market.install('issues')).rejects.toThrow(/DSH_WORKBENCH_TEST_UNSET/);
    expect(fake.commands()).toEqual([]);
  });

  it('★ 命令非零退出 → 还是那条带退出码与输出的诊断（不是裸错）', async () => {
    const fake = createFakeShell([{ exitCode: 1, stderr: 'npm ERR! EACCES: permission denied' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'missing', needs: [missingState()] } }),
      seam: fakeSeamOf(fake.shell),
    });

    await expect(market.install('issues')).rejects.toThrow(/（退出码 1）.*EACCES: permission denied/);
  });
});

describe('createMarketService：update', () => {
  it('只跑 need 给的更新命令；更新不触发"默认上板"', async () => {
    const onInstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    let first = true;
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: async (id: string): Promise<UnitCapability> => {
        const status = first ? 'outdated' : 'ok';
        first = false;
        return {
          unit: id,
          status,
          needs: [status === 'outdated' ? outdatedState() : okState()],
        };
      },
      seam: fakeSeamOf(fake.shell),
      onInstalled,
    });

    await market.update('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin update 'demo'"]);
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('★ 更新时 pnpm 拦了构建脚本 → 记待批、报 build-blocked；批准后重跑', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-market-policy-'));
    const command = `pnpm add --dir '${dir}' 'opencli-plugin-demo@1.1.0' --allow-build=opencli-plugin-demo`;
    let first = true;
    const probe = async (id: string): Promise<UnitCapability> => {
      const outdated = first;
      first = false;
      return {
        unit: id,
        status: outdated ? 'outdated' : 'ok',
        needs: [outdated ? outdatedState('demo', { command }) : okState()],
      };
    };
    const blocked = createFakeShell([
      {
        exitCode: 1,
        stderr: 'ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: sharp\nRun "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.\n',
      },
    ]);
    const market = createMarketService({
      command: 'opencli',
      manifests: [unit('issues')],
      probe,
      seam: fakeSeamOf(blocked.shell),
    });

    await expect(market.update('issues')).rejects.toMatchObject({
      code: 'build-blocked',
      pendingBuilds: ['sharp'],
    });
    expect(pendingBuildsOf(dir)).toEqual(['sharp']);

    let retryFirst = true;
    const retryProbe = async (id: string): Promise<UnitCapability> => {
      const outdated = retryFirst;
      retryFirst = false;
      return {
        unit: id,
        status: outdated ? 'outdated' : 'ok',
        needs: [outdated ? outdatedState('demo', { command }) : okState()],
      };
    };
    const retried = createFakeShell([{ stdout: '' }]);
    const again = createMarketService({
      command: 'opencli',
      manifests: [unit('issues')],
      probe: retryProbe,
      seam: fakeSeamOf(retried.shell),
    });

    await again.update('issues', { approvedBuilds: ['sharp'] });

    expect(retried.commands()).toEqual([command]);
    expect(pendingBuildsOf(dir)).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('★ 更新命令跑完还是旧的样子 → 抛出原因（不许静默）', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({ issues: { unit: 'issues', status: 'outdated', needs: [outdatedState()] } }),
      seam: fakeSeamOf(fake.shell),
    });

    await expect(market.update('issues')).rejects.toThrow(/仍是旧版本/);
  });
});

describe('createMarketService：update 同批依赖', () => {
  it('★ 同一份 prefix 下的两个插件，合成一条 pnpm add，不跑两遍', async () => {
    const prefix = mkdtempSync(join(tmpdir(), 'wb-market-batch-'));
    const suffix = ` && mkdir -p '${join(prefix, 'peer')}' && ln -s '${join(prefix, 'toolchain')}' '${join(prefix, 'peer')}'`;
    const commandOf = (name: string, version: string): string =>
      `pnpm add --dir '${prefix}' 'opencli-plugin-${name}@${version}' --registry 'https://r.example/' --store-dir '${join(prefix, 'store')}' --allow-build='opencli-plugin-${name}'${suffix}`;
    const two: UnitManifest = {
      ...unit('issues'),
      needs: [
        { kind: 'extension', runtime: 'opencli', name: 'one', commands: ['x'], purpose: '测试' },
        { kind: 'extension', runtime: 'opencli', name: 'two', commands: ['y'], purpose: '测试' },
      ],
    };
    let ran = false;
    const fake = createFakeShell(() => {
      ran = true;
      return {};
    });
    const probe = vi.fn(async (id: string): Promise<UnitCapability> => ({
      unit: id,
      status: ran ? 'ok' : 'outdated',
      needs: ran
        ? [okState('one'), okState('two')]
        : [
            outdatedState('one', { command: commandOf('one', '1.0.0') }),
            outdatedState('two', { command: commandOf('two', '2.0.0') }),
          ],
    }));
    const market = createMarketService({
      command: 'opencli',
      manifests: [two],
      probe,
      seam: fakeSeamOf(fake.shell),
    });

    await market.update('issues');

    expect(fake.commands()).toHaveLength(1);
    expect(fake.commands()[0]).toContain("'opencli-plugin-one@1.0.0' 'opencli-plugin-two@2.0.0'");
    expect(fake.commands()[0]?.match(/--allow-build=/gu)).toHaveLength(2);
    expect(fake.commands()[0]?.match(/ln -s/gu)).toHaveLength(1);
    rmSync(prefix, { recursive: true, force: true });
  });
});

describe('createMarketService：uninstall', () => {
  it('★ 还有别的模块要它 → 那份安装留着，同时把主张者说出来', async () => {
    const onUninstalled = vi.fn();
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues'), unit('builds')],
      probe: probeWith({}),
      seam: fakeSeamOf(fake.shell),
      references: () => ({ trustworthy: true, unreadable: [] }),
      onUninstalled,
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(keptFor).toEqual(['builds']);
    expect(onUninstalled).toHaveBeenCalledWith('issues');
  });

  it('独一份 → 真的卸掉', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({}),
      seam: fakeSeamOf(fake.shell),
      references: () => ({ trustworthy: true, unreadable: [] }),
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(keptFor).toEqual([]);
  });

  it('★ 别的模块已经放手（released）→ 不算主张者，安装照卸', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues'), unit('builds')],
      probe: probeWith({}),
      seam: fakeSeamOf(fake.shell),
      references: () => ({ trustworthy: true, unreadable: [] }),
      isReleased: (id) => id === 'builds',
    });

    const { keptFor } = await market.uninstall('issues');

    expect(fake.commands()).toEqual(["'opencli' plugin uninstall 'demo'"]);
    expect(keptFor).toEqual([]);
  });

  it('★ 引用不可信 → 插件那侧一根手指都不碰，还说清为什么', async () => {
    const fake = createFakeShell([{ stdout: '' }]);
    const logs: string[] = [];
    const market = createMarketService({

      command: 'opencli',      manifests: [unit('issues')],
      probe: probeWith({}),
      seam: fakeSeamOf(fake.shell),
      references: () => ({ trustworthy: false, unreadable: ['@a/mod'] }),
      logger: { info: (message) => logs.push(message) },
    });

    await market.uninstall('issues');

    expect(fake.commands()).toEqual([]);
    expect(logs.join('\n')).toContain('文件暂时保留');
  });
});
