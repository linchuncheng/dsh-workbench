import { evalPredicate } from '@dsh-workbench/shared/host';
import { DIY_BOARD_FLOW, HEADLESS_TITLES } from './definitions';

export interface FlowPosition {
  readonly index: number;
  readonly total: number;
  readonly remaining: number;
}

export function visibleSteps(destination: string | null): readonly { id: string; title: string }[] {
  const scope = { in: destination === null ? {} : { destination }, steps: {} };
  return DIY_BOARD_FLOW.steps
    .filter((step) => destination === null || step.when === undefined || evalPredicate(step.when, scope))
    .map((step) => ({
      id: step.id,
      title:
        (destination === 'headless' ? HEADLESS_TITLES[step.id] : undefined) ?? step.title ?? step.id,
    }));
}

export function positionOf(step: string | null, destination: string | null): FlowPosition {
  const steps = visibleSteps(destination);
  if (step === null) return { index: 0, total: steps.length, remaining: 0 };
  const at = steps.findIndex((one) => one.id === step);
  if (at < 0) return { index: 0, total: steps.length, remaining: 0 };
  return { index: at + 1, total: steps.length, remaining: steps.length - at - 1 };
}

export function titleOf(step: string | null, destination: string | null): string {
  if (step === null) return '';
  return visibleSteps(destination).find((one) => one.id === step)?.title ?? step;
}
