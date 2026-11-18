import { evalPredicate } from '@dsh-workbench/shared/host';
import type { DiyFlow } from './definitions';
import { flowFor, HEADLESS_TITLES } from './definitions';

export interface FlowPosition {
  readonly index: number;
  readonly total: number;
  readonly remaining: number;
}

export function visibleSteps(
  destination: string | null,
  values: Readonly<Record<string, unknown>> = {},
): readonly { id: string; title: string }[] {
  return visibleStepsOf(flowFor(destination), destination, values);
}

export function visibleStepsOf(
  flow: DiyFlow,
  destination: string | null,
  values: Readonly<Record<string, unknown>> = {},
): readonly { id: string; title: string }[] {
  const scope = { in: destination === null ? {} : { destination }, steps: values };
  return flow.steps
    .filter((step) => destination === null || step.when === undefined || evalPredicate(step.when, scope))
    .map((step) => ({
      id: step.id,
      title:
        (destination === 'headless' ? HEADLESS_TITLES[step.id] : undefined) ?? step.title ?? step.id,
    }));
}

export function positionOf(
  step: string | null,
  destination: string | null,
  values: Readonly<Record<string, unknown>> = {},
): FlowPosition {
  const steps = visibleSteps(destination, values);
  if (step === null) return { index: 0, total: steps.length, remaining: 0 };
  const at = steps.findIndex((one) => one.id === step);
  if (at < 0) return { index: 0, total: steps.length, remaining: 0 };
  return { index: at + 1, total: steps.length, remaining: steps.length - at - 1 };
}

export function titleOf(
  step: string | null,
  destination: string | null,
  values: Readonly<Record<string, unknown>> = {},
): string {
  if (step === null) return '';
  return visibleSteps(destination, values).find((one) => one.id === step)?.title ?? step;
}
