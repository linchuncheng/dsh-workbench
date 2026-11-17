import type { Need, NeedState, UnitCapability, UnitManifest } from '@dsh-workbench/shared';
import { needIdOf } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';

export interface DetailDependency {
  readonly kind: NeedState['kind'];
  readonly name: string;
  readonly status: NeedState['status'];
  readonly installed?: string;
  readonly latest?: string;
  readonly optional?: boolean;
}

export function detailDependenciesOf(
  capability: UnitCapability | undefined,
  declared: readonly Need[] = [],
): readonly DetailDependency[] {
  if (capability === undefined) return [];
  const optional = new Set(
    declared.filter((need) => need.required === false).map((need) => needIdOf(need)),
  );
  return capability.needs.map((need) => ({
    kind: need.kind,
    name: need.name,
    status: need.status,
    ...(need.installed === undefined ? {} : { installed: need.installed }),
    ...(need.latest === undefined ? {} : { latest: need.latest }),
    ...(optional.has(need.id) ? { optional: true } : {}),
  }));
}

export function detailDependenciesFor(
  capabilities: CapabilityMap | null,
  manifests: readonly UnitManifest[],
  unit: string,
): readonly DetailDependency[] {
  const manifest = manifests.find((one) => one.id === unit);
  return detailDependenciesOf(capabilities?.[unit], manifest?.needs);
}

export function dependencyRowActions(
  need: DetailDependency,
): readonly ('install' | 'update-dependency')[] {
  if (need.status === 'missing') return ['install'];
  if (need.status === 'outdated' || need.status === 'unsatisfied') return ['update-dependency'];
  return [];
}
