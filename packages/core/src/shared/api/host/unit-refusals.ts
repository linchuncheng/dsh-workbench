export interface UnitRefusalRow {
  readonly unit: string;
  readonly pkg?: string;
  readonly reasons: readonly string[];
}

export function refusalRowsOf(registry: {
  refusals(): readonly UnitRefusalRow[];
}): UnitRefusalRow[] {
  const latest = new Map<string, UnitRefusalRow>();
  for (const one of registry.refusals()) {
    if (one.unit === '') continue;
    latest.set(one.unit, {
      unit: one.unit,
      ...(one.pkg === undefined ? {} : { pkg: one.pkg }),
      reasons: one.reasons,
    });
  }
  return [...latest.values()];
}
