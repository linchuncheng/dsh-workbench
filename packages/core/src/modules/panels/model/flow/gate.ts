import type { FlowNodeStep } from '@dsh-workbench/shared/host';

export function deniedAtStep(step: FlowNodeStep): ReadonlySet<string> {
  return new Set(step.tools?.deny ?? []);
}
