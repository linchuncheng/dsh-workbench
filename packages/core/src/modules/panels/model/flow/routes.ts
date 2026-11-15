import type { RouteTable } from '@dsh-workbench/shared/host';
import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { DIY_BOARD_FLOW } from './definitions';
import type { DiyFlowRuns } from './runs';

export interface FlowStepView {
  readonly id: string;
  readonly title: string;
}

export function flowSteps(): readonly FlowStepView[] {
  return DIY_BOARD_FLOW.steps.map((step) => ({ id: step.id, title: step.title ?? step.id }));
}

export function diyFlowRoutes(runs: DiyFlowRuns): RouteTable {
  return {
    [DIY_FLOW_ROUTE]: (params) => {
      const session = params.get('session');
      const step = session === null ? null : runs.stepOf(session);
      const steps = flowSteps();
      const current = step === null ? null : (steps.find((one) => one.id === step.id) ?? null);
      return { ok: true, steps, current };
    },
  };
}
