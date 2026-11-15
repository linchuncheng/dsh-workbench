import type { FlowNodeStep } from '@dsh-workbench/shared/host';

export function deniedAtStep(step: FlowNodeStep, universe: readonly string[]): ReadonlySet<string> {
  const allow = new Set(step.tools?.allow ?? []);
  const deny = new Set(step.tools?.deny ?? []);
  const denied = new Set<string>();
  for (const name of universe) {
    if (deny.has(name)) denied.add(name);
    else if (!allow.has(name)) denied.add(name);
  }
  return denied;
}
