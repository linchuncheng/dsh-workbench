import type { Need, UnitManifest } from '@dsh-workbench/shared';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import { needsOf as needsOfManifest } from '@dsh-workbench/shared/host';
import type { MarketEntry } from './market-types';

export interface MarketEntryDeps {
  readonly catalog: () => readonly UnitManifest[];
  readonly probe?: ((unit: string, options?: { readonly force?: boolean }) => Promise<UnitCapability | undefined>) | undefined;
}

export function createMarketEntries(deps: MarketEntryDeps) {
  const { catalog, probe } = deps;

  function requireEntry(unit: string): UnitManifest {
    const manifest = catalog().find((item) => item.id === unit);
    if (manifest === undefined) {
      throw new Error(`市场里没有这个模块：${unit}（可安装：${catalog().map((item) => item.id).join(', ') || '（空）'}）`);
    }
    return manifest;
  }

  async function capabilityOf(unit: string, force = false): Promise<UnitCapability> {
    const probed = await probe?.(unit, { force });
    return (
      probed ?? {
        unit,
        status: 'unchecked',
        needs: [],
        detail: '没有探测能力（缺少命令执行入口或探测服务）',
      }
    );
  }

  function needsOf(unit: string): readonly Need[] {
    return needsOfManifest(requireEntry(unit));
  }

  async function entryOf(unit: string, force = false): Promise<MarketEntry> {
    const manifest = requireEntry(unit);
    return {
      unit,
      titleKey: manifest.titleKey,
      needs: needsOfManifest(manifest),
      capability: await capabilityOf(unit, force),
    };
  }

  return { requireEntry, capabilityOf, needsOf, entryOf };
}
