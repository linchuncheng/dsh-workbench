export interface InstalledToShow {
  readonly listed: ReadonlySet<string>;
  readonly settling: ReadonlySet<string>;
  readonly busyId?: string | undefined;
  readonly pinnedId?: string | undefined;
  readonly removing?: string | undefined;
}

export function installedToShow<T extends { readonly unit: string }>(
  modules: readonly T[],
  options: InstalledToShow,
): readonly T[] {
  return modules.filter((module) => {
    if (module.unit === options.pinnedId || module.unit === options.removing) return false;
    if (!options.settling.has(module.unit)) return true;
    if (module.unit === options.busyId) return true;
    return !options.listed.has(module.unit);
  });
}
