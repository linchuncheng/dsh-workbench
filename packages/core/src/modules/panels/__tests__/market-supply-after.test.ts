import { describe, expect, it, vi } from 'vitest';
import type { Need } from '@dsh-workbench/shared';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import { createSupplyAfter } from '../model/market-supply-after';
import type { MarketEntry } from '../model/market-types';

const module: InstalledModule = { kind: 'module', pkg: '@t/module-a', unit: 'a', version: '1.0.0' };

const extension: Need = { kind: 'extension', runtime: 'opencli', name: 'demo', purpose: '测试' };

const entry: MarketEntry = {
  unit: 'a',
  titleKey: 'a',
  needs: [extension],
  capability: { unit: 'a', status: 'ok', needs: [] },
};

function change(application: BundleChange['application']): BundleChange {
  return { application, stage: 'install', changed: true, target: '@t/module-a' };
}

describe('装完之后补依赖：失败要带上「待批的构建脚本」', () => {
  it('不是模块 / 没声明依赖 → 不装', async () => {
    const install = vi.fn(async () => entry);
    const declared = createSupplyAfter({ declaredNeeds: () => [extension], install });
    const none = createSupplyAfter({ declaredNeeds: () => [], install });

    expect(await declared({ kind: 'unknown', pkg: '@t/x' }, change('applied'))).toEqual({ state: 'not-a-module' });
    expect(await none(module, change('applied'))).toEqual({ state: 'no-needs' });
    expect(install).not.toHaveBeenCalled();
  });

  it('读不到声明：要重启就说 pending-restart，否则 no-needs', async () => {
    const after = createSupplyAfter({ declaredNeeds: () => undefined, install: async () => entry });

    expect(await after(module, change('restart-required'))).toEqual({ state: 'pending-restart' });
    expect(await after(module, change('applied'))).toEqual({ state: 'no-needs' });
  });

  it('装着 → installed；被构建脚本拦下 → failed 且带 pendingBuilds', async () => {
    const installed = createSupplyAfter({ declaredNeeds: () => [extension], install: async () => entry });
    expect(await installed(module, change('applied'))).toEqual({ state: 'installed', entry });

    const blocked = createSupplyAfter({
      declaredNeeds: () => [extension],
      install: async () => {
        throw new WorkbenchDataError('build-blocked', 'Ignored build scripts', {
          pendingBuilds: ['@jackwener/opencli'],
        });
      },
    });
    expect(await blocked(module, change('applied'))).toEqual({
      state: 'failed',
      reason: 'Ignored build scripts',
      pendingBuilds: ['@jackwener/opencli'],
    });
  });

  it('别的失败照旧只说原因（不冒充待批）', async () => {
    const after = createSupplyAfter({
      declaredNeeds: () => [extension],
      install: async () => {
        throw new Error('（退出码 1）：EACCES');
      },
    });

    expect(await after(module, change('applied'))).toEqual({ state: 'failed', reason: '（退出码 1）：EACCES' });
  });
});
