import type { RouteTable } from '@dsh-workbench/shared/host';
import { evalPredicate } from '@dsh-workbench/shared/host';
import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { DIY_BOARD_FLOW, HEADLESS_TITLES } from './definitions';
import type { DiyFlowRuns } from './runs';

export interface FlowStepView {
  readonly id: string;
  readonly title: string;
}

export function flowSteps(values: Readonly<Record<string, unknown>> = {}): readonly FlowStepView[] {
  const scope = { in: {}, steps: values };
  const decided = values['judge'] !== undefined;
  const judge = values['judge'];
  const headless =
    typeof judge === 'object' && judge !== null && (judge as { destination?: unknown }).destination === 'headless';
  return DIY_BOARD_FLOW.steps
    .filter((step) => !decided || step.when === undefined || evalPredicate(step.when, scope))
    .map((step) => ({
      id: step.id,
      title: (headless ? HEADLESS_TITLES[step.id] : undefined) ?? step.title ?? step.id,
    }));
}

export function diyFlowRoutes(runs: DiyFlowRuns): RouteTable {
  return {
    [DIY_FLOW_ROUTE]: (params) => {
      const session = params.get('session');
      const step = session === null ? null : runs.stepOf(session);
      const steps = flowSteps(session === null ? {} : runs.valuesOf(session));
      const current = step === null ? null : (steps.find((one) => one.id === step.id) ?? null);
      return { ok: true, steps, current };
    },
  };
}
