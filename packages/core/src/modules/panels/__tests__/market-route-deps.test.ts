import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { BundleManager, InstalledModule, SupplyPort } from '@dsh-workbench/shared/host';
import { routeDepsOf, syncModuleRowsOf } from '../model/market-route-deps';

const CORE = '@dsh-workbench/core';
const MOD = '@t/mod';

function profileDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-route-deps-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'p', dependencies: { [MOD]: 'link:/tmp/mod' }, dsh: { profile: { bundles: [CORE] } } }),
    'utf8',
  );
  writeFileSync(join(dir, 'cordis.patch.yml'), '', 'utf8');
  return dir;
}

function supplyOf(modules: readonly InstalledModule[]): SupplyPort {
  return {
    profileModules: () => modules,
    packageRouteOf: async () => undefined,
  } as unknown as SupplyPort;
}

const manager = { registries: async () => null } as unknown as BundleManager;

describe('市场装模块时给路由那一头的依赖', () => {
  it('★ 带着 profile 目录与同步动作：装完能写行', () => {
    const dir = profileDir();
    const deps = routeDepsOf({
      manager,
      command: 'opencli',
      supply: supplyOf([{ kind: 'module', pkg: MOD, unit: 'mod', version: '1.0.0' }]),
      runAll: async () => undefined,
      registryFix: {},
      supplyAfter: async () => ({ state: 'no-needs' }),
      profileDir: dir,
    });

    expect(deps.profileDir).toBe(dir);
    deps.syncRows?.();
    expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toContain(`name: '${MOD}'`);
  });

  it('没有 profile 目录时同步动作什么都不做', () => {
    const sync = syncModuleRowsOf(null, supplyOf([]));
    expect(() => sync()).not.toThrow();
  });

  it('★ 卸载走的是 dsh 的插件管理器（组合包那条），不是自己删目录', async () => {
    const remove = vi.fn(async () => ({ application: 'applied' as const, stage: 'remove' as const, changed: true, target: MOD }));
    const deps = routeDepsOf({
      manager,
      command: 'opencli',
      supply: supplyOf([]),
      runAll: async () => undefined,
      registryFix: {},
      supplyAfter: async () => ({ state: 'no-needs' }),
    });

    expect(deps.remove).toBeTypeOf('function');
    expect(remove).not.toHaveBeenCalled();
  });
});
