import type { Need, UnitManifest } from '@dsh-workbench/shared';
import type { ProfileModule, UnitCapability, UnitMountDeps } from '@dsh-workbench/shared/host';
import { needsOf as needsOfManifest, readDeclaration } from '@dsh-workbench/shared/host';
import type { MarketEntry } from './market-types';

export type CapabilityProbe = (
  unit: string,
  force?: boolean,
  needs?: readonly Need[],
) => Promise<UnitCapability>;

export interface MarketEntryDeps {
  readonly catalog: () => readonly UnitManifest[];
  readonly probe?: NonNullable<UnitMountDeps['probe']>;
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

  async function capabilityOf(unit: string, force = false, needs?: readonly Need[]): Promise<UnitCapability> {
    const probed = await probe?.(unit, { force, ...(needs === undefined ? {} : { needs }) });
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

export interface DeclaredNeedsDeps {
  readonly manifests: () => readonly UnitManifest[];
  readonly modules?: (() => readonly ProfileModule[]) | undefined;
  readonly profileDir?: string | null | undefined;
  readonly declarationOf: (dir: string, pkg: string) => unknown;
}

export function declaredNeedsOf(unit: string, deps: DeclaredNeedsDeps): readonly Need[] | undefined {
  const manifest = deps.manifests().find((item) => item.id === unit);
  if (manifest !== undefined) return needsOfManifest(manifest);
  const row = (deps.modules?.() ?? []).find((item) => item.unit === unit);
  if (row === undefined || deps.profileDir === undefined || deps.profileDir === null) return undefined;
  return readDeclaration(row.pkg, deps.declarationOf(deps.profileDir, row.pkg)).manifest?.needs;
}

export function installableNeedsOf(declared: readonly Need[] | undefined): readonly Need[] {
  return (declared ?? []).filter(
    (need) => need.kind === 'extension' || need.kind === 'lib' || need.kind === 'bin',
  );
}

export const PROBE_RETRY_MS = 1_200;

export async function probeBeforeInstall(
  unit: string,
  declared: readonly Need[] | undefined,
  capabilityOf: CapabilityProbe,
): Promise<UnitCapability> {
  const before = await capabilityOf(unit, true, declared);
  if (installableNeedsOf(declared).length === 0) return before;
  if (before.needs.length > 0 && before.status !== 'unchecked') return before;
  await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_MS));
  return capabilityOf(unit, true, declared);
}

export interface LooseEntryDeps {
  readonly manifests: () => readonly UnitManifest[];
  readonly needsOf: (unit: string) => readonly Need[] | undefined;
  readonly capabilityOf: CapabilityProbe;
  readonly capability?: UnitCapability | undefined;
}

export async function looseEntryOf(unit: string, deps: LooseEntryDeps): Promise<MarketEntry> {
  const manifest = deps.manifests().find((item) => item.id === unit);
  const declared = deps.needsOf(unit);
  return {
    unit,
    titleKey: manifest?.titleKey ?? unit,
    needs: declared ?? [],
    capability: deps.capability ?? (await deps.capabilityOf(unit, false, declared)),
  };
}
