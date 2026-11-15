import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { useApiResource } from '@/shared/hooks/use-api-resource';

export { DIY_FLOW_ROUTE };

export interface DiyFlowStepView {
  readonly id: string;
  readonly title: string;
}

export interface DiyFlowView {
  readonly steps: readonly DiyFlowStepView[];
  readonly current: DiyFlowStepView | null;
}

export function useDiyFlow(session: string | null, token = 0): DiyFlowView | null {
  const read = useApiResource<{ steps?: readonly DiyFlowStepView[]; current?: DiyFlowStepView | null }>(
    DIY_FLOW_ROUTE,
    session === null ? {} : { session },
    token,
    { report: false },
  );
  if (read.value === undefined) return null;
  return { steps: read.value.steps ?? [], current: read.value.current ?? null };
}
