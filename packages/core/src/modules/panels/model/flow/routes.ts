import type { RouteTable } from '@dsh-workbench/shared/host';
import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { visibleSteps } from './position';
import type { DiyFlowRuns } from './runs';

export interface FlowStepView {
  readonly id: string;
  readonly title: string;
}

export function flowSteps(input: Readonly<Record<string, unknown>> = {}): readonly FlowStepView[] {
  const destination = typeof input['destination'] === 'string' ? input['destination'] : null;
  return visibleSteps(destination);
}

export function diyFlowRoutes(runs: DiyFlowRuns): RouteTable {
  return {
    [DIY_FLOW_ROUTE]: (params) => {
      const session = params.get('session');
      const step = session === null ? null : runs.stepOf(session);
      const steps = flowSteps(session === null ? {} : runs.inputOf(session));
      const current = step === null ? null : (steps.find((one) => one.id === step.id) ?? null);
      return { ok: true, steps, current };
    },
  };
}
