import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
const PLUGIN_MANIFEST_FILE = 'opencli-plugin.json';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { profileModules } from '@dsh-workbench/shared/host';
import { syncModuleRows } from '@/shared/api/host/module-rows-sync';
import { fakeSeamOf } from './seam-fake';
import type { DshShell } from '@dsh-workbench/shared/host';
import type { BundleChange, BundleInstallRequest } from '@/kernel/contract/bundle-install';
import type { BundleManager, ProvisionProblem, Seam, SupplyPort } from '@dsh-workbench/shared/host';
import { diagnoseInstallFailure, planStepText, PlanStepError, refusalReason } from '@dsh-workbench/shared/host';
import { createMarketService } from '../model/market';
import { sourceProblemText } from '../model/market-dependency';
import { installError } from '../model/market-install-error';
import { bundleNameOf, installRouted, replaceRouted, type BundleInstallDeps, type ReplaceBundleDeps } from '../model/market-route';
import type { BundleInstallOutcome } from '../model/market-types';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';

const REGISTRY = 'https://npm.example.com/team/';
const roots: string[] = [];

function dirOf(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-route-'));
  roots.push(root);
  const at = path.join(root, name);
  fs.mkdirSync(at, { recursive: true });
  return at;
}

function put(at: string, file: string, body: unknown): void {
  const target = path.join(at, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
}

function pluginSupply(
  route: (options: { spec: string }) => unknown,
  style: 'plugin-only' | 'npm-then-plugin' = 'plugin-only',
): SupplyPort {
  return {
    env: { isolatedRoot: () => '/tmp/wb-route-runtime', isolatedHome: () => '/tmp/wb-route-home' },
    packageRouteOf: async (options: { spec: string }) => route(options) as never,
    pluginInstallPlan: (plan: { spec: string; command: string }) => ({
      ok: true,
      steps:
        style === 'plugin-only'
          ? [{ kind: 'run', line: `'${plan.command}' plugin install '${plan.spec}'` }]
          : [
              { kind: 'run', line: `npm i --prefix '/tmp/wb-route-plugins' '${plan.spec}'` },
              { kind: 'run', line: `'${plan.command}' plugin install '${plan.spec}'` },
            ],
    }),
    modules: { isolatedRoot: () => '/tmp/wb-route-runtime', isolatedHome: () => '/tmp/wb-route-home' },
  } as unknown as SupplyPort;
}

function pluginFixture(): string {
  const at = dirOf('plugin-a');
  put(at, 'package.json', { name: '@t/plugin-a', version: '1.0.0' });
  put(at, PLUGIN_MANIFEST_FILE, { name: 'plugina' });
  put(at, 'list.js', 'x');
  return at;
}

function bothFixture(): string {
  const at = dirOf('both-a');
  put(at, 'package.json', { name: '@t/both-a', dsh: { bundle: {} } });
  put(at, PLUGIN_MANIFEST_FILE, { name: 'botha' });
  put(at, 'list.js', 'x');
  return at;
}

function plainFixture(): string {
  const at = dirOf('plain');
  put(at, 'package.json', { name: '@t/plain' });
  return at;
}

function change(spec: string): BundleChange {
  return { application: 'applied', stage: 'install', changed: true, target: spec, bundle: spec };
}

function bundlesOf(): { manager: BundleManager; install: ReturnType<typeof vi.fn> } {
  const install = vi.fn(async (request: BundleInstallRequest) => change(request.spec));
  const manager: BundleManager = {
    registries: async () => null,
    inspect: async () => null,
    install,
    remove: async () => null,
    cancel: async () => null,
  };
  return { manager, install };
}

function packingShell(view: string): { seam: Seam; commands: string[] } {
  const commands: string[] = [];
  const shell = {
    resolve: (request: { readonly command: string }) => {
      commands.push(request.command);
      return request;
    },
    execute: async (spec: { readonly command?: string }) => {
      const command = String(spec?.command ?? '');
      let exitCode = 0;
      let stdout = '';
      if (command.startsWith('npm view')) {
        stdout = view;
      } else {
        const packTo = /--pack-destination '([^']+)'/.exec(command)?.[1];
        const unpackTo = /-C '([^']+)'/.exec(command)?.[1];
        if (packTo !== undefined) {
          fs.writeFileSync(path.join(packTo, 'demo-1.0.0.tgz'), 'tgz');
          stdout = '[{"filename":"demo-1.0.0.tgz"}]';
        } else if (unpackTo !== undefined) {
          for (const [name, body] of Object.entries({
            'package.json': '{"name":"@t/demo"}',
            'opencli-plugin.json': '{"name":"demo"}',
            'list.js': 'x',
          })) {
            const target = path.join(unpackTo, 'package', name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, body, 'utf8');
          }
        } else {
          exitCode = 1;
        }
      }
      return {
        result: async () => ({
          exitCode,
          timedOut: false,
          aborted: false,
          stdout: { text: stdout, truncated: false },
          stderr: { text: '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
  return { seam: fakeSeamOf(shell), commands };
}

function rig(options: {
  readonly spec: string;
  readonly seam?: Seam | undefined;
  readonly registry?: string | undefined;
  readonly ledger?: PluginLedger | undefined;
  readonly supply?: SupplyPort | undefined;
}): { deps: BundleInstallDeps; install: ReturnType<typeof vi.fn>; commands: string[] } {
  const commands: string[] = [];
  const { manager, install } = bundlesOf();
  return {
    install,
    commands,
    deps: {
      spec: options.spec,
      command: 'opencli',
      manager,
      installed: (pkg) => ({ kind: 'unknown', pkg }),
      runAll: async (steps) => {
        for (const step of steps) commands.push(planStepText(step));
      },
      supplyAfter: async () => ({ state: 'no-needs' }),
      rememberSource: async () => {},
      ...(options.seam === undefined ? {} : { seam: options.seam }),
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      ...(options.ledger === undefined ? {} : { ledger: options.ledger }),
      ...(options.supply === undefined ? {} : { supply: options.supply }),
    },
  };
}

function ledgerAt(home: string): PluginLedger {
  return createPluginLedger({ store: createWorkspaceStore({ root: dirOf('store') }), home });
}

beforeEach(() => {
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('添加一个 spec：按内容判它是什么，再决定走哪条路', () => {
  it('★ 判成 opencli 插件 → 走我们自己的安装器，dsh 的安装管理器一次也不叫', async () => {
    const at = pluginFixture();
    const { deps, install, commands } = rig({ spec: at, supply: pluginSupply(() => ({ kind: 'runtime-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' })) });

    const outcome: BundleInstallOutcome = await installRouted(deps);

    expect(install).not.toHaveBeenCalled();
    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([`'opencli' plugin install '${at}'`]);
    expect(outcome.change).toMatchObject({ application: 'applied', stage: 'install' });
    expect(outcome.plugin).toEqual({ kind: 'runtime-plugin', pkg: '@t/plugin-a', name: 'plugina' });
    expect(outcome.supply).toEqual({ state: 'no-needs' });
  });

  it('★ 判成 dsh 扩展包 → 交回 installBundle，原样的 spec（带版本）一个字不改', async () => {
    const { seam, commands: shellCommands } = packingShell('{"bundle":{}}');
    const { deps, install, commands } = rig({ spec: '@t/mod@1.2.3', seam, registry: REGISTRY });

    const outcome = await installRouted({ ...deps, options: { registry: REGISTRY } });

    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]?.[0]).toEqual({ spec: '@t/mod@1.2.3', registry: REGISTRY });
    expect(shellCommands).toHaveLength(1);
    expect(shellCommands.some((line) => line.includes('npm pack'))).toBe(false);
    expect(commands).toEqual([]);
    expect(outcome.plugin).toBeUndefined();
  });

  it('★ 两样都有 → 按 dsh 走，且只装一遍（不给自己再装一次）', async () => {
    const at = bothFixture();
    const { deps, install, commands } = rig({ spec: at });

    const outcome = await installRouted(deps);

    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]?.[0]).toEqual({ spec: at });
    expect(commands).toEqual([]);
    expect(outcome.plugin).toBeUndefined();
    expect(outcome.change.application).toBe('applied');
  });

  it('★ 源上的包判成插件 → 走 plugin-source 的 npm 分支（装进 plugins-npm 再让 opencli 认它）', async () => {
    const { seam } = packingShell('{}');
    const ledger = ledgerAt('/tmp/wb-route-home/workbench/opencli/home');
    const { deps, install, commands } = rig({
      spec: '@t/demo@1.0.0',
      seam,
      registry: REGISTRY,
      ledger,
      supply: pluginSupply(() => ({ kind: 'runtime-plugin', pkg: '@t/demo', pluginName: 'demo' }), 'npm-then-plugin'),
    });

    const outcome = await installRouted(deps);

    expect(install).not.toHaveBeenCalled();
    expect(commands[0]).toContain('npm i --prefix');
    expect(commands.at(-1)).toContain("'opencli' plugin install");
    expect(outcome.plugin).toEqual({ kind: 'runtime-plugin', pkg: '@t/demo', name: 'demo' });
    expect(ledger.read('@t/demo')).toMatchObject({ package: '@t/demo', registry: REGISTRY });
    expect(ledger.read('@t/demo')?.local).toBeUndefined();
  });

  it('★ 都不是 → 拒（记一笔、不抛），dsh 与 opencli 两边都不动', async () => {
    const { deps, install, commands } = rig({ spec: plainFixture() });

    const outcome = await installRouted(deps);

    expect(install).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    expect(outcome.change).toMatchObject({
      application: 'failed',
      stage: 'install',
      changed: false,
      target: '@t/plain',
      errorCode: 'not-a-module-or-plugin',
      errorDetail: refusalReason(),
    });
    expect(outcome.supply).toEqual({ state: 'no-needs' });
    expect(outcome.plugin).toBeUndefined();
  });

  it('★ 读不动 / 没有源 → 判不了就交给 dsh（fail-open：判据不许变成拒因）', async () => {
    const empty = dirOf('no-package-json');
    const missing = rig({ spec: empty });
    const noRegistry = rig({ spec: '@t/mod' });

    await expect(installRouted(missing.deps)).resolves.toMatchObject({ change: { application: 'applied' } });
    expect(missing.install).toHaveBeenCalledTimes(1);
    await expect(installRouted(noRegistry.deps)).resolves.toMatchObject({ change: { application: 'applied' } });
    expect(noRegistry.install).toHaveBeenCalledTimes(1);
  });

  it('★ 拒因是给人看的：外壳 / 协议 / 声明 / 清单 / apiVersion 一个都不出现', () => {
    const banned = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    const text = refusalReason();

    for (const word of banned) expect(text, word).not.toContain(word);
    expect(text).toContain('运行时');
  });
});

describe('插件那条路失败：回结构化失败（不抛），诊断信息一条不丢', () => {
  const COMMAND = "'opencli' plugin install '/tmp/wb-route-plugin'";
  const OUTPUT = [
    'npm ERR! code EACCES',
    'npm ERR! syscall mkdir',
    'npm ERR! path /tmp/wb-route-plugins',
    'npm ERR! errno -13',
    'npm ERR! line-5',
    'npm ERR! line-6',
    'npm ERR! line-7',
    'npm ERR! line-8',
    'npm ERR! line-9',
    'npm ERR! line-10',
  ].join('\n');

  function planSupplyOf(plan: { readonly ok: false; readonly problem: ProvisionProblem; readonly env?: string }): SupplyPort {
    return {
      env: { isolatedRoot: () => '/tmp/wb-route-runtime', isolatedHome: () => '/tmp/wb-route-home' },
      packageRouteOf: async () => ({ kind: 'runtime-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' }),
      pluginInstallPlan: () => plan,
      modules: { isolatedRoot: () => '/tmp/wb-route-runtime', isolatedHome: () => '/tmp/wb-route-home' },
    } as unknown as SupplyPort;
  }

  it('★ runAll 抛（真的 installError）→ application failed / operation-error，message、完整 output、失败那步的命令行都在 errorDetail 里', async () => {
    const at = pluginFixture();
    const failure = installError(diagnoseInstallFailure({ command: COMMAND, exitCode: 1, output: OUTPUT }));
    const { deps, install, commands } = rig({
      spec: at,
      supply: pluginSupply(() => ({ kind: 'runtime-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' })),
    });

    const outcome = await installRouted({
      ...deps,
      runAll: async () => {
        throw failure;
      },
    });

    expect(install).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    expect(outcome.change).toMatchObject({
      application: 'failed',
      stage: 'install',
      changed: false,
      target: '@t/plugin-a',
      errorCode: 'operation-error',
    });
    const detail = outcome.change.errorDetail ?? '';
    expect(detail).toMatch(/没有写入权限|被系统拦截/u);
    expect(detail).toContain('npm ERR! line-10');
    expect(detail).toContain(COMMAND);
    expect(detail).toContain('npm ERR! code EACCES');
    expect(outcome.plugin).toBeUndefined();
  });

  it('★ 命令非零退出 → 失败结果带上真实退出码（卡片据此显示「退出码 127」）', async () => {
    const dir = dirOf('profile');
    const { deps } = rig({ spec: '@t/module-a@1.1.9', supply: pluginSupply(() => ({ kind: 'dsh-bundle' })) });
    const step = { kind: 'run' as const, line: "'pnpm' add --dir '/x' '@t/module-a@1.1.9' --save-exact" };

    const outcome = await installRouted({
      ...deps,
      profileDir: dir,
      options: { route: 'module' },
      runAll: async () => {
        throw new PlanStepError(step, 127, 'bash: nope');
      },
    });

    expect(outcome.change).toMatchObject({
      application: 'failed',
      errorCode: 'operation-error',
      packageResult: { exitCode: 127, output: expect.stringContaining('退出码 127') },
    });
  });

  it('★ 失败时台账回滚、不走 settle（不记来源、不探供给）', async () => {
    const at = pluginFixture();
    const ledger = ledgerAt(dirOf('store'));
    const seen: (string | undefined)[] = [];
    const calls: string[] = [];
    const { deps } = rig({
      spec: at,
      ledger,
      supply: pluginSupply(() => ({ kind: 'runtime-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' })),
    });

    const outcome = await installRouted({
      ...deps,
      runAll: async () => {
        seen.push(ledger.read('@t/plugin-a')?.package);
        throw new Error('盘写不进去');
      },
      rememberSource: async () => {
        calls.push('rememberSource');
      },
      supplyAfter: async () => {
        calls.push('supplyAfter');
        return { state: 'no-needs' };
      },
    });

    expect(seen).toEqual(['@t/plugin-a']);
    expect(ledger.read('@t/plugin-a')).toBeUndefined();
    expect(ledger.list()).toEqual([]);
    expect(calls).toEqual([]);
    expect(outcome.change).toMatchObject({
      application: 'failed',
      errorCode: 'operation-error',
      errorDetail: '盘写不进去',
    });
  });

  it('★ 计划不成（env-missing / malformed / not-declared）→ 同样结构化失败，errorDetail 是 sourceProblemText 原文', async () => {
    const cases: readonly (readonly [ProvisionProblem, string | undefined])[] = [
      ['env-missing', 'DSH_WB_PLUGIN_SRC'],
      ['malformed', undefined],
      ['not-declared', undefined],
    ];
    for (const [problem, env] of cases) {
      const at = pluginFixture();
      const { deps, install, commands } = rig({ spec: at, supply: planSupplyOf({ ok: false, problem, ...(env === undefined ? {} : { env }) }) });

      const outcome = await installRouted(deps);

      expect(install, problem).not.toHaveBeenCalled();
      expect(commands, problem).toEqual([]);
      expect(outcome.change, problem).toMatchObject({
        application: 'failed',
        stage: 'install',
        changed: false,
        target: '@t/plugin-a',
        errorCode: 'operation-error',
        errorDetail: sourceProblemText(problem, env),
      });
      expect(outcome.plugin, problem).toBeUndefined();
    }
  });
});

describe('从安装结果里认包名：git 源那种 spec 不许在 path 的 @ 上乱切', () => {
  const failed = (over: Partial<BundleChange> = {}): BundleChange =>
    ({ application: 'failed', stage: 'install', changed: false, target: '', ...over }) as BundleChange;

  it('★ path 里带 scope 时，包名就是路径末段（不是把 spec 从 @ 处切一半）', () => {
    const spec =
      'git+ssh://git@host/org/repo.git#0123456789012345678901234567890123456789&path:/packages/@dsh-workbench/module-mcp';
    expect(bundleNameOf(failed(), spec)).toBe('@dsh-workbench/module-mcp');
  });

  it('path 不带 scope 也给得对；dsh 回了 bundle 就听 dsh 的', () => {
    const spec = 'git+https://host/org/repo.git#0123456789012345678901234567890123456789&path:/packages/module-x';
    expect(bundleNameOf(failed(), spec)).toBe('module-x');
    expect(bundleNameOf(failed({ bundle: '@t/real' }), spec)).toBe('@t/real');
  });

  it('npm 那种带版本的 spec 照旧按最后一个 @ 切', () => {
    expect(bundleNameOf(failed(), '@t/module@1.2.3')).toBe('@t/module');
    expect(bundleNameOf(failed(), '@t/module')).toBe('@t/module');
  });
});

describe('接线：市场那条路交给路由，且没有插件管理器时还是先说那句话', () => {
  it('★ 装一个本地插件目录：管理器一次不叫，命令走我们自己的安装器', async () => {
    const at = pluginFixture();
    const fake = createFakeShell([{ stdout: '' }]);
    const { manager, install } = bundlesOf();
    const market = createMarketService({
      command: 'opencli',
      manifests: [],
      seam: fakeSeamOf(fake.shell),
      bundles: manager,
      supply: pluginSupply(() => ({ kind: 'runtime-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' })),
    });

    const outcome = await market.installBundle(at);

    expect(install).not.toHaveBeenCalled();
    expect(fake.commands()).toEqual([`'opencli' plugin install '${at}'`]);
    expect(outcome.plugin?.pkg).toBe('@t/plugin-a');
  });

  it('★ 没有插件管理器 → 还是先抛那句人话（路由不许把老错误吞掉）', async () => {
    const market = createMarketService({ command: 'opencli', manifests: [] });

    await expect(market.installBundle('@a/b')).rejects.toThrow(/没有插件管理器/);
  });

  it('★ 计划里的文件步走 node:fs（不进 shell）：remove / mkdir 真的落到盘上', async () => {
    const at = pluginFixture();
    const doomed = path.join(at, 'doomed.txt');
    fs.writeFileSync(doomed, 'x', 'utf8');
    const made = path.join(at, 'made');
    const fake = createFakeShell([{ stdout: '' }]);
    const { manager } = bundlesOf();
    const market = createMarketService({
      command: 'opencli',
      manifests: [],
      seam: fakeSeamOf(fake.shell),
      bundles: manager,
      supply: {
        env: { isolatedRoot: () => '/tmp/wb-route-runtime', isolatedHome: () => '/tmp/wb-route-home' },
        packageRouteOf: async () => ({ kind: 'runtime-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' }),
        pluginInstallPlan: () => ({
          ok: true,
          steps: [
            { kind: 'remove', path: doomed },
            { kind: 'mkdir', path: made },
            { kind: 'run', line: `'opencli' plugin install '${at}'` },
          ],
        }),
        modules: { isolatedRoot: () => '/tmp/wb-route-runtime', isolatedHome: () => '/tmp/wb-route-home' },
      } as unknown as SupplyPort,
    });

    await market.installBundle(at);

    expect(fs.existsSync(doomed)).toBe(false);
    expect(fs.existsSync(made)).toBe(true);
    expect(fake.commands()).toEqual([`'opencli' plugin install '${at}'`]);
  });
});

describe('工作台模块（没有 dsh.bundle）：装进 profile + 写一行，不叫 dsh 的安装器', () => {
  function moduleSupply(route: unknown): SupplyPort {
    return pluginSupply(() => route);
  }

  it('★ pnpm add --dir <profile>，装完同步行，dsh 的安装管理器一次也不叫', async () => {
    const { deps, install, commands } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });
    const syncRows = vi.fn();

    const outcome = await installRouted({
      ...deps,
      profileDir: '/tmp/wb-profile',
      syncRows,
      installed: (pkg) => ({ kind: 'module', pkg, unit: 'a', version: '1.0.0' }),
    });

    expect(install).not.toHaveBeenCalled();
    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '/tmp/wb-profile' '@t/module-a' --save-exact`,
    ]);
    expect(syncRows).toHaveBeenCalledTimes(1);
    expect(outcome.change).toMatchObject({ application: 'applied', stage: 'install', changed: true });
    expect(outcome.module).toEqual({ kind: 'module', pkg: '@t/module-a', unit: 'a', version: '1.0.0' });
  });

  it('带 registry 时把 --registry 写进同一条命令', async () => {
    const { deps, commands } = rig({
      spec: '@t/module-a@1.2.0',
      supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }),
    });

    await installRouted({
      ...deps,
      registry: 'https://npm.example.com/team/',
      profileDir: '/tmp/wb-profile',
      syncRows: () => {},
    });

    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '/tmp/wb-profile' '@t/module-a@1.2.0' --save-exact --registry 'https://npm.example.com/team/'`,
    ]);
  });

  it('没有 profile 目录 → 失败，不跑命令', async () => {
    const { deps, commands } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });

    const outcome = await installRouted(deps);

    expect(commands).toEqual([]);
    expect(outcome.change.application).toBe('failed');
    expect(outcome.change.errorCode).toBe('no-profile-dir');
  });

  it('★ 装上了但写行失败 → 不算生效：报 module-row-failed，并说清怎么修', async () => {
    const { deps, commands } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });
    const warn = vi.fn();

    const outcome = await installRouted({
      ...deps,
      profileDir: '/tmp/wb-profile',
      syncRows: () => {
        throw new Error('patch 写不进去');
      },
      logger: { warn },
    });

    expect(commands).toHaveLength(1);
    expect(warn.mock.calls[0]?.[0]).toContain('模块行没有写入');
    expect(outcome.change).toMatchObject({ application: 'failed', errorCode: 'module-row-failed' });
    expect(outcome.change.errorDetail).toContain('cordis.patch.yml');
  });
});

describe('接线跟着装出来的那一版走：带 bundle 的放回名单，不带的摘掉并写行', () => {
  function profileAt(options: {
    readonly pkg: string;
    readonly version: string;
    readonly bundles: readonly string[];
    readonly shipsBundle: boolean;
  }): string {
    const dir = dirOf('profile');
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'p',
        dsh: { profile: { bundles: [...options.bundles] } },
        dependencies: { [options.pkg]: options.version },
      }),
      'utf8',
    );
    const at = path.join(dir, 'node_modules', options.pkg);
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({
        name: options.pkg,
        version: options.version,
        dsh: {
          workbench: { unit: 'a', card: { order: 10 }, tools: [], host: { inject: [] } },
          ...(options.shipsBundle ? { bundle: { patch: './cordis.patch.yml' } } : {}),
        },
      }),
      'utf8',
    );
    return dir;
  }

  function togglingManager(
    dir: string,
    install: (request: BundleInstallRequest) => BundleChange,
  ): { manager: BundleManager; setEnabled: ReturnType<typeof vi.fn> } {
    const setEnabled = vi.fn(async (pkg: string, enabled: boolean) => {
      const file = path.join(dir, 'package.json');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        dsh?: { profile?: { bundles?: string[] } };
      };
      const bundles = manifest.dsh?.profile?.bundles ?? [];
      manifest.dsh = {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles: enabled ? [...new Set([...bundles, pkg])] : bundles.filter((item) => item !== pkg),
        },
      };
      fs.writeFileSync(file, JSON.stringify(manifest), 'utf8');
      return { application: 'applied', stage: 'install', changed: true, target: pkg } as BundleChange;
    });
    return {
      setEnabled,
      manager: {
        registries: async () => null,
        inspect: async () => null,
        install: async (request: BundleInstallRequest) => install(request),
        remove: async () => null,
        cancel: async () => null,
        setEnabled,
      },
    };
  }

  function failNotBundle(request: BundleInstallRequest): BundleChange {
    return {
      application: 'failed',
      stage: 'install',
      changed: false,
      target: request.spec,
      errorCode: 'not-bundle',
      errorDetail: 'declares no bundle',
    };
  }

  it('★ 市场条目说它是模块 → 不再问源判形态，直接 pnpm add + 写行', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.0.0', bundles: [], shipsBundle: false });
    const asked = vi.fn(() => {
      throw new Error('不该问源');
    });
    const supply = pluginSupply(asked);
    const { deps, install, commands } = rig({ spec: '@t/module-a@1.2.0', supply });
    const syncRows = vi.fn();

    const outcome = await installRouted({
      ...deps,
      profileDir: dir,
      syncRows,
      options: { route: 'module' },
    });

    expect(asked).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '${dir}' '@t/module-a@1.2.0' --save-exact`,
    ]);
    expect(syncRows).toHaveBeenCalledTimes(1);
    expect(outcome.change.application).toBe('applied');
  });

  it('★ 按模块重装也失败 → 按 lockfile 把 profile 拉回一致（不留半装状态）', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.0.0', bundles: [], shipsBundle: false });
    const { deps } = rig({ spec: '@t/module-a@1.1.9', supply: pluginSupply(() => ({ kind: 'dsh-bundle' })) });
    const { manager } = togglingManager(dir, failNotBundle);
    const lines: string[] = [];

    const outcome = await installRouted({
      ...deps,
      manager,
      profileDir: dir,
      options: { route: 'bundle' },
      runAll: async (steps) => {
        for (const step of steps) {
          const line = planStepText(step);
          lines.push(line);
          if (line.includes(' add ')) throw new Error('pnpm 装不上');
        }
      },
    });

    expect(lines.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '${dir}' '@t/module-a@1.1.9' --save-exact`,
      `'pnpm' install --frozen-lockfile --dir '${dir}'`,
    ]);
    expect(outcome.change.application).toBe('failed');
  });

  it('★ 市场那种 git spec：包名从 path 末段取，不把整串当包名', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.0.0', bundles: [], shipsBundle: false });
    const spec = `git+ssh://git@host/org/repo.git#${'a'.repeat(40)}&path:/artifacts/@t/module-a`;
    const { deps, commands } = rig({ spec, supply: pluginSupply(() => ({ kind: 'dsh-bundle' })) });
    const syncRows = vi.fn();

    const outcome = await installRouted({
      ...deps,
      profileDir: dir,
      syncRows,
      options: { route: 'module' },
      installed: (pkg) => ({ kind: 'module', pkg, unit: 'a', version: '1.2.0' }),
    });

    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '${dir}' '${spec}' --save-exact`,
    ]);
    expect(outcome.change.target).toBe('@t/module-a');
    expect(outcome.module).toEqual({ kind: 'module', pkg: '@t/module-a', unit: 'a', version: '1.2.0' });
  });

  it('★ dsh 回 not-bundle → 按工作台模块再装一次，不停在失败上', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.0.0', bundles: [], shipsBundle: false });
    const { deps, commands } = rig({ spec: '@t/module-a@1.1.9', supply: pluginSupply(() => ({ kind: 'dsh-bundle' })) });
    const { manager, setEnabled } = togglingManager(dir, failNotBundle);
    const syncRows = vi.fn();
    const info = vi.fn();

    const outcome = await installRouted({
      ...deps,
      manager,
      profileDir: dir,
      syncRows,
      options: { route: 'bundle' },
      logger: { info },
    });

    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '${dir}' '@t/module-a@1.1.9' --save-exact`,
    ]);
    expect(setEnabled).not.toHaveBeenCalled();
    expect(syncRows).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain('改按工作台模块安装');
    expect(outcome.change.application).toBe('applied');
  });

  it('★ 新版不带 dsh.bundle 却还在名单里 → 摘掉，再写行', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.1.9', bundles: ['@t/module-a'], shipsBundle: false });
    const { deps, commands } = rig({ spec: '@t/module-a', supply: pluginSupply(() => ({ kind: 'dsh-module', pkg: '@t/module-a' })) });
    const { manager, setEnabled } = togglingManager(dir, (request) => change(request.spec));

    const outcome = await installRouted({
      ...deps,
      manager,
      profileDir: dir,
      syncRows: () => {
        syncModuleRows({ profileDir: dir, modules: profileModules(dir) });
      },
    });

    expect(commands).toHaveLength(1);
    expect(setEnabled.mock.calls[0]).toEqual(['@t/module-a', false]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } };
    };
    expect(manifest.dsh.profile.bundles).not.toContain('@t/module-a');
    expect(fs.readFileSync(path.join(dir, 'cordis.patch.yml'), 'utf8')).toContain('wb-a');
    expect(outcome.change.application).toBe('applied');
  });

  it('★ 这一版又带 dsh.bundle 了但不在名单里 → 放回名单（行留给同步去清）', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.0.0', bundles: [], shipsBundle: true });
    const { deps } = rig({ spec: '@t/module-a', supply: pluginSupply(() => ({ kind: 'dsh-module', pkg: '@t/module-a' })) });
    const { manager, setEnabled } = togglingManager(dir, (request) => change(request.spec));
    const syncRows = vi.fn();

    await installRouted({ ...deps, manager, profileDir: dir, syncRows });

    expect(setEnabled.mock.calls[0]).toEqual(['@t/module-a', true]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: string[] } };
    };
    expect(manifest.dsh.profile.bundles).toContain('@t/module-a');
  });

  it('★ 名单改不动 → 不算生效：报 bundle-list-failed，详情点名 dsh.profile.bundles', async () => {
    const dir = profileAt({ pkg: '@t/module-a', version: '1.1.9', bundles: ['@t/module-a'], shipsBundle: false });
    const { deps } = rig({ spec: '@t/module-a', supply: pluginSupply(() => ({ kind: 'dsh-module', pkg: '@t/module-a' })) });
    const setEnabled = vi.fn(async () => null);
    const manager: BundleManager = {
      registries: async () => null,
      inspect: async () => null,
      install: async () => null,
      remove: async () => null,
      cancel: async () => null,
      setEnabled,
    };

    const outcome = await installRouted({ ...deps, manager, profileDir: dir, syncRows: () => {} });

    expect(setEnabled).toHaveBeenCalledTimes(1);
    expect(outcome.change).toMatchObject({ application: 'failed', errorCode: 'bundle-list-failed' });
    expect(outcome.change.errorDetail).toContain('dsh.profile.bundles');
  });
});

describe('模块安装遇到被拦的构建脚本：记账、可批准、批准后重跑', () => {
  function moduleSupply(route: unknown): SupplyPort {
    return pluginSupply(() => route);
  }

  function profileWith(text?: string): string {
    const dir = dirOf('profile');
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }), 'utf8');
    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      text ?? 'packages:\n  - .\n',
      'utf8',
    );
    return dir;
  }

  function policyOf(dir: string): string {
    return fs.readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8');
  }

  it('★ pnpm 非零退出且报了被忽略的构建 → build-blocked，待批清单写进 profile 的策略文件', async () => {
    const profileDir = profileWith();
    const { deps } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });

    const outcome = await installRouted({
      ...deps,
      profileDir,
      runAll: async () => {
        throw new Error('pnpm failed\nIgnored build scripts: sharp, esbuild');
      },
      outputOf: () => '',
      syncRows: () => {},
    });

    expect(outcome.change).toMatchObject({ application: 'failed', errorCode: 'build-blocked' });
    expect(outcome.change.pendingBuilds).toEqual(['sharp', 'esbuild']);
    expect(policyOf(profileDir)).toContain('sharp: set this to true or false');
  });

  it('★ 装成功但输出里说构建被跳过 → 仍算安装成功，但把待批清单带出来（不装作一切正常）', async () => {
    const profileDir = profileWith();
    const { deps } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });
    const warn = vi.fn();

    const outcome = await installRouted({
      ...deps,
      profileDir,
      runAll: async () => undefined,
      outputOf: () => 'Progress: resolved 12\nIgnored build scripts: sharp',
      syncRows: () => {},
      logger: { warn, info: () => {} },
    });

    expect(outcome.change).toMatchObject({ application: 'applied', stage: 'install' });
    expect(outcome.change.pendingBuilds).toEqual(['sharp']);
    expect(warn.mock.calls[0]?.[0]).toContain('构建脚本没有运行');
  });

  it('★ 带 approvedBuilds 重装：先把策略改成允许，再跑 pnpm', async () => {
    const profileDir = profileWith('packages:\n  - .\nallowBuilds:\n  sharp: set this to true or false\n');
    const { deps } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });

    const outcome = await installRouted({
      ...deps,
      profileDir,
      options: { approvedBuilds: ['sharp'] },
      runAll: async () => undefined,
      outputOf: () => 'Done in 3.1s',
      syncRows: () => {},
    });

    expect(policyOf(profileDir)).toContain('sharp: true');
    expect(outcome.change.application).toBe('applied');
  });

  it('批准的名字不在待批清单里 → 失败，pnpm 一次都不跑（防手抖批量放行）', async () => {
    const profileDir = profileWith('packages:\n  - .\nallowBuilds:\n  sharp: set this to true or false\n');
    const { deps, commands } = rig({ spec: '@t/module-a', supply: moduleSupply({ kind: 'dsh-module', pkg: '@t/module-a' }) });

    const outcome = await installRouted({
      ...deps,
      profileDir,
      options: { approvedBuilds: ['sharp', '手抖写错'] },
      runAll: async () => undefined,
      syncRows: () => {},
    });

    expect(commands).toEqual([]);
    expect(outcome.change.application).toBe('failed');
    expect(outcome.change.errorDetail).toContain('手抖写错');
  });
});

describe('替换/更新也认路线：模块走 pnpm + 行，组合包照旧叫 dsh', () => {
  function replaceDeps(deps: BundleInstallDeps): ReplaceBundleDeps {
    return {
      ...deps,
      remove: async () => ({ application: 'applied', stage: 'remove', changed: true, target: '@t/module-a' }),
    };
  }

  it('★ 模块：不叫 dsh 的 install，跑 pnpm add 并同步行', async () => {
    const { deps, install, commands } = rig({
      spec: '@t/module-a@1.3.0',
      supply: pluginSupply(() => ({ kind: 'dsh-module', pkg: '@t/module-a' })),
    });
    const syncRows = vi.fn();

    const outcome = await replaceRouted(
      { ...replaceDeps(deps), profileDir: '/tmp/wb-profile', syncRows },
      '@t/module-a@1.3.0',
    );

    expect(install).not.toHaveBeenCalled();
    expect(commands.map((line) => line.replace(/^& /u, ''))).toEqual([
      `'pnpm' add --dir '/tmp/wb-profile' '@t/module-a@1.3.0' --save-exact`,
    ]);
    expect(syncRows).toHaveBeenCalledTimes(1);
    expect(outcome.change).toMatchObject({ application: 'applied', stage: 'install' });
  });

  it('★ 组合包：照旧交给 dsh 的插件管理器（不跑 pnpm）', async () => {
    const at = pluginFixture();
    const { deps, install, commands } = rig({
      spec: at,
      supply: pluginSupply(() => ({ kind: 'dsh-bundle', pkg: '@t/plugin-a' })),
    });

    await replaceRouted(replaceDeps(deps), at);

    expect(install).toHaveBeenCalled();
    expect(commands).toEqual([]);
  });
});

describe('模块安装可以被取消', () => {
  it('★ 取消后 pnpm 那一步回 aborted → 结果是 cancelled，不算失败', async () => {
    const control = new AbortController();
    const { deps } = rig({ spec: '@t/module-a', supply: pluginSupply(() => ({ kind: 'dsh-module', pkg: '@t/module-a' })) });

    const outcome = await installRouted({
      ...deps,
      profileDir: '/tmp/wb-profile',
      options: { requestId: 'r1', signal: control.signal },
      runAll: async () => {
        control.abort();
        const { PlanCancelledError } = await import('@dsh-workbench/shared/host');
        throw new PlanCancelledError({ kind: 'run', line: 'pnpm add' });
      },
      syncRows: () => {
        throw new Error('取消了就不该写行');
      },
    });

    expect(outcome.change).toMatchObject({ application: 'cancelled', stage: 'install', changed: false });
  });
});
