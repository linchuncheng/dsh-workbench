import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { extensionNeedOf, fakeNpmSource, manifestOf } from '@dsh-workbench/shared/testing';
import {
  MARKET_DOT,
  MARKET_STATE_KEY,
  installedRows,
  marketActions,
  marketRows,
  marketSwitchLocked,
  marketUpdatesOf,
} from '../market-rows';
import { marketSections } from '../market-sections';

function unit(id: string, plugin?: string): UnitManifest {
  return manifestOf({
    id,
    ...(plugin === undefined
      ? {}
      : { needs: [extensionNeedOf(plugin, { commands: ['x'], sources: [fakeNpmSource] })] }),
  });
}


type FixtureNeedState = {
  readonly name: string;
  readonly status: string;
  readonly missing?: readonly string[];
  readonly installed?: string;
  readonly latest?: string;
  readonly provision?: CapabilityMap[string]['needs'][number]['provision'];
  readonly release?: { readonly installed?: string; readonly latest?: string };
  readonly command?: string;
  readonly purpose?: string;
};

type FixtureExtra = Partial<CapabilityMap[string]> & {
  readonly extensions?: readonly FixtureNeedState[];
  readonly libs?: readonly FixtureNeedState[];
  readonly provision?: CapabilityMap[string]['needs'][number]['provision'];
  readonly missing?: readonly string[];
};

function needStatusOf(status: string): CapabilityMap[string]['needs'][number]['status'] {
  if (status === 'degraded') return 'ok';
  if (status === 'unsupported' || status === 'failed') return 'unchecked';
  return status as CapabilityMap[string]['needs'][number]['status'];
}

function statesOf(extra: FixtureExtra, kind: 'extension' | 'lib'): CapabilityMap[string]['needs'] {
  const list = kind === 'extension' ? (extra.extensions ?? []) : (extra.libs ?? []);
  return list.map((state) => {
    const installed = state.installed ?? state.release?.installed;
    const latest = state.latest ?? state.release?.latest;
    const provision = state.provision ?? extra.provision;
    return {
      id: `${kind}:${state.name}`,
      kind,
      name: state.name,
      status: needStatusOf(state.status),
      detail: '假探测',
      ...(state.missing === undefined ? {} : { missing: state.missing }),
      ...(installed === undefined ? {} : { installed }),
      ...(latest === undefined ? {} : { latest }),
      ...(provision === undefined ? {} : { provision }),
      ...(state.command === undefined ? {} : { command: state.command }),
    };
  });
}

function translated(extra: FixtureExtra): Partial<CapabilityMap[string]> {
  const { extensions: _extensions, libs: _libs, provision: _provision, missing: _missing, ...rest } = extra;
  const needs = [...statesOf(extra, 'extension'), ...statesOf(extra, 'lib')];
  const withFirstMissing =
    extra.missing === undefined || needs[0] === undefined
      ? needs
      : [{ ...needs[0], missing: extra.missing }, ...needs.slice(1)];
  return {
    ...rest,
    ...(withFirstMissing.length === 0 ? {} : { needs: withFirstMissing }),
  };
}

function capability(
  id: string,
  status: CapabilityMap[string]['status'] = 'ok',
  extra: FixtureExtra = {},
): CapabilityMap {
  const mapped = translated(extra);
  const base =
    status === 'ok' || status === 'unchecked'
      ? []
      : [
          {
            id: 'extension:demo',
            kind: 'extension' as const,
            name: 'demo',
            status: status === 'outdated' ? ('outdated' as const) : ('missing' as const),
            detail: '假探测',
          },
        ];
  const needs =
    mapped.needs ??
    (extra.missing === undefined || base[0] === undefined
      ? base
      : [{ ...base[0], missing: extra.missing }, ...base.slice(1)]);
  return { [id]: { unit: id, status, needs, ...mapped } };
}

describe('装没装：本机的名单说了算，没得探不等于不知道', () => {
  it('★ 本机装着、又没有依赖要探（DIY 本地那份那种）→ 已安装 + 卸载', () => {
    const row = marketRows([unit('hello')], {}, { hello: { installed: '0.1.0' } })[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUninstall).toBe(true);
    expect(row?.canInstall).toBe(false);
    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('★ 但要探依赖时，没结论仍旧是「状态未知」—— 但装着的就能卸', () => {
    const row = marketRows([unit('issues', 'demo')], {}, { issues: { installed: '0.1.0' } })[0];

    expect(row?.state).toBe('unknown');
    expect(row?.canUninstall).toBe(true);
  });

  it('★ 本机名单里没有它、又没结论 → 还是「状态未知」（不是已安装）', () => {
    const row = marketRows([unit('hello')], {})[0];

    expect(row?.state).toBe('unknown');
    expect(row?.canUninstall).toBe(false);
  });
});

describe('本机那份（link: 装的，含 DIY 工坊造的）', () => {
  it('★ 源上就算有更新的版本，也不给「有新版本」、也不摆「更新」（点了会顶掉本地那份）', () => {
    const updates = marketUpdatesOf([
      { unit: 'hello', pkg: '@p/hello', installed: '0.1.0', latest: '0.2.0', local: true },
    ]);

    expect(updates).toEqual({ hello: { installed: '0.1.0', local: true, pkg: '@p/hello' } });
  });

  it('★ 行上带「本地」标记；非本地那份不带', () => {
    const local = marketRows(
      [unit('hello')],
      capability('hello', 'ok'),
      { hello: { installed: '0.1.0', local: true } },
    )[0];
    const fromRegistry = marketRows(
      [unit('hello')],
      capability('hello', 'ok'),
      { hello: { installed: '0.1.0' } },
    )[0];

    expect(local?.local).toBe(true);
    expect(local?.canUpdate).toBe(false);
    expect(marketActions(local as never)).toEqual(['uninstall']);
    expect(fromRegistry?.local).toBeUndefined();
  });

  it('★ 「装了但用不上」那一行（本机那份 + 声明坏了）也不给「更新」，只剩卸载', () => {
    const rows = installedRows(
      [
        {
          unit: 'hello',
          pkg: '@p/hello',
          installed: '0.1.0',
          latest: '0.2.0',
          local: true,
          refused: ['声明坏了'],
        },
      ],
      [],
      new Set(),
    );

    expect(rows[0]?.state).toBe('unusable');
    expect(rows[0]?.moduleUpdate).toBeUndefined();
    expect(rows[0]?.local).toBe(true);
    expect(rows[0]?.version).toEqual({ installed: '0.1.0' });
    expect(marketActions(rows[0] as never)).toEqual(['remove-bundle']);
  });
});

describe('为什么该更新：一句话 + 底下说清缘由', () => {
  it('★ 缺必需命令 → 状态就是「有新版本」，行上不点名缺哪几条（名字是内部细节，留给详情与 agent）', () => {
    const row = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'outdated', { missing: ['x', 'y'] }),
    )[0];

    expect(row?.state).toBe('outdated');
    expect(MARKET_STATE_KEY.outdated).toBe('panels.market.moduleOutdated');
    expect(row?.note).toBeUndefined();
  });

  it('★ 清单写的版本和盘上不一致 → 行上给「更新」，按清单那一版重装（不再一直卡着）', () => {
    const rows = installedRows(
      [{ unit: 'mod', pkg: '@p/mod', installed: '1.1.9', spec: '1.1.8', declared: '1.1.8' }],
      [unit('mod')],
      new Set(),
    );

    expect(rows[0]?.state).toBe('installed');
    expect(rows[0]?.canUpdate).toBe(true);
    expect(rows[0]?.reinstall).toBe('@p/mod@1.1.8');
    expect(rows[0]?.note).toMatchObject({
      key: 'panels.market.configDriftedNote',
      params: { declared: '1.1.8', installed: '1.1.9' },
      tone: 'alert',
    });
    expect(marketActions(rows[0] as never)).toEqual(['install-version', 'remove-bundle']);
  });

  it('模块包有新版本 → 同一句「有新版本」，理由靠版本箭头说', () => {
    const row = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'ok'),
      { issues: { installed: '0.1.2', latest: '0.2.0' } },
    )[0];

    expect(row?.state).toBe('outdated');
    expect(row?.note).toBeUndefined();
    expect(row?.version).toEqual({ installed: '0.1.2', latest: '0.2.0' });
  });
});

describe('异常的行：那颗「全局默认」照画，但禁用', () => {
  const refused = installedRows(
    [{ unit: 'old', pkg: '@p/old', installed: '0.1.0', refused: ['声明坏了'] }],
    [],
    new Set(),
    undefined,
    new Set(['old']),
  )[0];
  const notLoaded = installedRows(
    [{ unit: 'inventory', pkg: '@p/inventory', installed: '0.2.0' }],
    [],
    new Set(),
    undefined,
    new Set(['inventory']),
  )[0];

  it('★ 不可用 ⇒ 钮在（带机器板那份读数）但禁用', () => {
    expect(refused?.state).toBe('unusable');
    expect(refused?.defaultShown).toBe(true);
    expect(marketSwitchLocked(refused as never)).toBe(true);
  });

  it('★ 还没载入（状态未知）⇒ 钮是能动的（载入后正好用上）', () => {
    expect(notLoaded?.state).toBe('unknown');
    expect(notLoaded?.defaultShown).toBe(true);
    expect(marketSwitchLocked(notLoaded as never)).toBe(false);
  });

  it('★ 装在本机上的都归「已安装」：版本不一致、旧数据待迁移也算，不落「未就绪」', () => {
    const rows = [
      ...marketRows([unit('a')], capability('a', 'unsupported'), { a: { installed: '1.0.0', pkg: '@a/a' } }),
      ...marketRows([unit('b')], capability('b', 'ok'), { b: { installed: '1.0.0', pkg: '@a/b' } }),
    ].map((row) => ({ ...row, state: row.id === 'b' ? ('pending-followup' as const) : row.state }));

    for (const row of rows) expect(marketSections([row])[0]?.id, row.id).toBe('installed');
  });

  it('★ 装好了却缺依赖 ⇒ 开关锁住：先装依赖，不然打开也跑不起来', () => {
    const depsMissing = marketRows([unit('four')], capability('four', 'missing', { provision: 'ready' }), {
      four: { installed: '0.1.0' },
    })[0];
    const notInstalled = marketRows([unit('five')], capability('five', 'missing', { provision: 'ready' }))[0];

    expect(marketSwitchLocked(depsMissing as never)).toBe(true);
    expect(marketSwitchLocked(notInstalled as never)).toBe(false);
  });

  it('★ 好好的 / 有新版本 / 只是没装 ⇒ 都不禁用', () => {
    const rows = [
      ...marketRows([unit('hello')], capability('hello', 'ok'), { hello: { installed: '0.1.0' } }),
      ...marketRows([unit('two')], capability('two', 'missing', { provision: 'ready' })),
      ...marketRows([unit('three')], capability('three', 'ok'), {
        three: { installed: '0.1.0', latest: '0.2.0' },
      }),
    ];

    for (const row of rows) expect(marketSwitchLocked(row), row.id).toBe(false);
  });
});

describe('段落：装了但市场还没认识它的，也在「已安装模块」那一段', () => {
  it('★ 还没载入 / 不可用 的行与能用的模块同段；没装的才进「未安装」', () => {
    const rows = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'missing', { provision: 'ready' }),
    );
    const notLoaded = installedRows(
      [
        { unit: 'inventory', pkg: '@p/inventory', installed: '0.2.0' },
        { unit: 'old', pkg: '@p/old', installed: '0.1.0', refused: ['声明坏了'] },
      ],
      [],
      new Set(),
    );

    const sections = marketSections([...rows, ...notLoaded]);

    expect(sections.map((section) => section.id)).toEqual(['installed', 'not-installed']);
    expect(sections[0]?.rows.map((row) => row.id)).toEqual(['inventory', 'old']);
    expect(sections[0]?.rows.map((row) => row.state)).toEqual(['unknown', 'unusable']);
    expect(sections[1]?.rows.map((row) => row.id)).toEqual(['issues']);
  });
});

describe('运行时与插件版本不一致：单独一档，不冒充损坏', () => {
  it('★ unsupported → 单独一档，带黄点，词是「版本不一致」', () => {
    const row = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'unsupported'),
    )[0];

    expect(row?.state).toBe('unsupported');
    expect(MARKET_STATE_KEY.unsupported).toBe('panels.market.pluginVersionMismatch');
    expect(MARKET_DOT.unsupported).toBe('warning');
  });
});
