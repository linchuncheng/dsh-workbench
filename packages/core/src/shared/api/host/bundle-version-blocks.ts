import type { Seam } from '@dsh-workbench/shared/host';
import {
  declarationApiVersionOf,
  dshCompatibilityOf,
  dshRequirementsOf,
  prereleaseChannelOf,
  SUPPORTED_API_VERSIONS,
  supplyPortOf,
} from '@dsh-workbench/shared/host';
import type { BundleIncompatible, ModuleUpdateBlock } from '@/kernel/contract/bundle-install';

const holdLog = new Map<string, string>();

export function resetHoldLog(): void {
  holdLog.clear();
}

export function visibleVersions<T extends { readonly version: string; readonly prerelease: boolean }>(
  versions: readonly T[],
  channels: readonly string[],
): readonly T[] {
  if (channels.length === 0) return versions.filter((entry) => !entry.prerelease);
  return versions.filter((entry) => {
    const channel = prereleaseChannelOf(entry.version);
    return channel !== undefined && channels.includes(channel);
  });
}

export function updateBlockOf(raw: unknown, problems: readonly string[]): ModuleUpdateBlock | undefined {
  if (problems.length === 0) return undefined;
  const declared = declarationApiVersionOf(raw);
  const newest = Math.max(...SUPPORTED_API_VERSIONS);
  return { kind: declared !== undefined && declared > newest ? 'needs-workbench' : 'incompatible' };
}

export async function judgedBlockOf(
  supply: ReturnType<typeof supplyPortOf>,
  input: {
    readonly seam: Seam | undefined;
    readonly name: string;
    readonly version: string;
    readonly registry: string | undefined;
    readonly force: boolean;
    readonly dshVersion: string | undefined;
  },
): Promise<ModuleUpdateBlock | undefined> {
  if (input.seam === undefined || input.registry === undefined || input.dshVersion === undefined) {
    return { kind: 'unverified' };
  }
  const manifest = await supply.versionManifestOf({
    seam: input.seam,
    name: input.name,
    version: input.version,
    registry: input.registry,
    force: input.force,
  });
  if (manifest === undefined) return { kind: 'unverified' };
  const verdict = dshCompatibilityOf({
    requirements: dshRequirementsOf(manifest).filter((item) => item.source === 'engines'),
    dshVersion: input.dshVersion,
  });
  if (verdict.verdict === 'incompatible') {
    const requirements: Record<string, string> = {};
    for (const item of verdict.requirements) {
      requirements[item.source === 'engines' ? 'engines.dsh' : item.pkg] = item.range;
    }
    return { kind: 'incompatible', requirements, runtimeVersion: input.dshVersion };
  }
  return verdict.verdict === 'unknown' ? { kind: 'unverified' } : undefined;
}

export function dshBlockOf(incompatible: BundleIncompatible | undefined): ModuleUpdateBlock | undefined {
  if (incompatible === undefined) return undefined;
  return {
    kind: 'incompatible',
    requirements: incompatible.requirements,
    runtimeVersion: incompatible.runtimeVersion,
  };
}

export async function latestIfReleaseReady(
  supply: ReturnType<typeof supplyPortOf>,
  input: {
    readonly pkg: string;
    readonly version: string;
    readonly registry: string;
    readonly seam: Seam;
    readonly force: boolean;
    readonly logger?: { warn?(message: string): void } | undefined;
  },
): Promise<string | undefined> {
  const missing = await supply.missingReleaseParts({
    seam: input.seam,
    name: input.pkg,
    registry: input.registry,
    version: input.version,
    force: input.force,
  });
  if (missing.length === 0) {
    holdLog.delete(input.pkg);
    return input.version;
  }
  const line = `${input.version}|${missing.join('、')}`;
  if (holdLog.get(input.pkg) !== line) {
    holdLog.set(input.pkg, line);
    input.logger?.warn?.(
      `[dsh-workbench] 源上已经有 ${input.pkg}@${input.version}，但这一份发布还没铺齐（${missing.join('、')} 在这个版本上还拉不到）—— 先不提示更新；等铺齐或点「重新检查」。`,
    );
  }
  return undefined;
}
