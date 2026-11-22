import { PLUGIN_ID, type Seam } from '@dsh-workbench/shared/host';
import { requireSupply } from '@dsh-workbench/shared/host';
import type { BundleManager, InstalledModule, ProfilePackage, SupplyPort } from '@dsh-workbench/shared/host';
import type { SelfUpdateRequest, SelfUpdateStart } from '@dsh-workbench/shared/host';
import type { BundleInstallOutcome } from './market-types';

export interface WorkbenchUpdateDeps {
  readonly asked: string;
  readonly workbench?: ((pkg: string) => ProfilePackage | undefined) | undefined;
  readonly seam?: Seam | undefined;
  readonly installed?: ((pkg: string) => InstalledModule) | undefined;
  readonly dshHome?: (() => string) | undefined;
  readonly profileRegistry?: (() => Promise<string | undefined>) | undefined;
  readonly profileName?: (() => string | null) | undefined;
  readonly selfUpdate?:
    | ((request: SelfUpdateRequest, onError: (message: string) => void) => SelfUpdateStart)
    | undefined;
  readonly prereleaseChannels?: (() => readonly string[]) | undefined;
  readonly running?: string | undefined;
  readonly dshVersion?: (() => string | undefined) | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly supply?: SupplyPort | undefined;
  readonly manager?: BundleManager | undefined;
}

export async function updateWorkbenchOnce(deps: WorkbenchUpdateDeps): Promise<BundleInstallOutcome> {
  const supply = deps.supply ?? requireSupply();
  const asked = deps.asked.trim();
  const target = asked === '' ? PLUGIN_ID : asked;
  if (target !== PLUGIN_ID) {
    throw new Error(`这里只更新工作台自身（${PLUGIN_ID}），不支持 ${target}`);
  }
  const read = deps.workbench?.(target);
  if (read === undefined) {
    throw new Error(`读不到这份工作台配置中安装的 ${target}，无法判断安装的是哪一份，更新无法进行。`);
  }
  if (read.local === true) {
    throw new Error('这份工作台是从源码目录装进来的（开发副本），不从源上更新。');
  }
  const seam = deps.seam;
  const registry = read.registry ?? (await deps.profileRegistry?.());
  const askedLatest =
    seam === undefined || registry === undefined
      ? undefined
      : await supply.latestVersion({
          seam,
          name: read.pkg,
          registry,
          force: true,
          prereleaseChannels: deps.prereleaseChannels?.() ?? [],
        });
  if (askedLatest !== undefined && registry !== undefined && deps.manager?.listVersions !== undefined) {
    const listed = await deps.manager.listVersions(read.pkg, registry).catch(() => null);
    const entry =
      listed?.status === 'listed' ? listed.versions.find((one) => one.version === askedLatest) : undefined;
    if (entry?.incompatible !== undefined) {
      const need = Object.entries(entry.incompatible.requirements)
        .map(([name, range]) => `${name} ${range}`)
        .join('、');
      throw new Error(
        `源上 ${read.pkg}@${askedLatest} 要求 ${need === '' ? '更高的 dsh' : need}，当前运行的是 dsh ${entry.incompatible.runtimeVersion}。先升级 dsh，再更新工作台。`,
      );
    }
  }
  if (seam !== undefined && registry !== undefined && askedLatest !== undefined) {
    const missing = await supply.missingReleaseParts({
      seam,
      name: read.pkg,
      registry,
      version: askedLatest,
      force: true,
    });
    if (missing.length > 0) {
      throw new Error(
        `源上已有 ${read.pkg}@${askedLatest}，但这次发布尚未铺齐：${missing.join('、')} 在这一版上仍然拉不到。安装后会缺少依赖，稍后重试；模块市场页的「重新检查」会重新探测。`,
      );
    }
  }
  const home = deps.dshHome?.();
  const profile = deps.profileName?.();
  if (home === undefined || profile === undefined || profile === null) {
    throw new Error('读不到 DSH_HOME 或工作台配置名称；自更新需要在外部进程运行，无法继续。');
  }
  const targetVersion = askedLatest ?? read.version;
  if (targetVersion === read.version && deps.running !== undefined && deps.running !== read.version) {
    throw new Error('这个版本已经安装完成，先重启工作台再更新。');
  }
  const spec =
    askedLatest === undefined ? `${read.pkg}@latest` : `${read.pkg}@${askedLatest}`;
  const run = deps.selfUpdate ?? deps.supply?.startSelfUpdate ?? (() => { throw new Error('自动更新组件未提供'); });
  let failure = '';
  const dshVersion = deps.dshVersion?.();
  const started = run(
    {
      dshHome: home,
      profile,
      pkg: read.pkg,
      from: read.version,
      to: askedLatest ?? '',
      ...(deps.running === undefined ? {} : { running: deps.running }),
      ...(dshVersion === undefined || dshVersion === '' ? {} : { dshVersion }),
      pinned: askedLatest !== undefined,
    },
    (message: string) => {
      failure = message;
      deps.logger?.warn?.(`[dsh-workbench] ${message}`);
    },
  );
  if (!started.started) {
    throw new Error(failure === '' ? '工作台更新没有开始；稍后重试。' : failure);
  }
  deps.logger?.info?.(
    `[dsh-workbench] 自更新交给外部执行器（${started.paths.planFile}）：${read.version} → ${askedLatest ?? '最新版'}，本次操作不删除自己那一行`,
  );
  return {
    change: {
      application: 'restart-required',
      stage: 'install',
      changed: false,
      target: spec,
      bundle: read.pkg,
    },
    module: deps.installed?.(read.pkg) ?? { kind: 'unknown', pkg: read.pkg },
    supply: { state: 'no-needs' },
  };
}
