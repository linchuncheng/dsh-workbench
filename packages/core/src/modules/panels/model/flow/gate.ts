import type { FlowNodeStep } from '@dsh-workbench/shared/host';

export function deniedAtStep(step: FlowNodeStep): ReadonlySet<string> {
  return new Set(step.tools?.deny ?? []);
}

export const BEFORE_FLOW: ReadonlySet<string> = new Set(['write', 'edit']);
