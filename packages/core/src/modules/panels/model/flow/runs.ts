import type { FlowHost, FlowNodeStep, FlowSession } from '@dsh-workbench/shared/host';
import type { DiyFlow } from './definitions';

interface Run {
  readonly flow: DiyFlow;
  readonly session: FlowSession;
}

export interface DiyFlowRuns {
  stepOf(session: string): FlowNodeStep | null;
  start(session: string): FlowNodeStep;
  provide(session: string, value: unknown): boolean;
  advance(session: string, value: unknown): Promise<FlowNodeStep | null>;
  stop(session: string): void;
}

export function createDiyFlowRuns(options: {
  readonly host: FlowHost;
  readonly flow: DiyFlow;
  readonly workspaceOf: (session: string) => string;
  readonly onEnd: (session: string) => void;
}): DiyFlowRuns {
  const runs = new Map<string, Run>();

  const stepAt = (run: Run): FlowNodeStep | null => {
    const position = run.session.current();
    if (position === null) return null;
    return run.flow.steps.find((step) => step.id === position.stepId) ?? null;
  };

  return {
    stepOf(session) {
      const run = runs.get(session);
      return run === undefined ? null : stepAt(run);
    },

    start(session) {
      const existing = runs.get(session);
      if (existing !== undefined) {
        const step = stepAt(existing);
        if (step !== null) return step;
        runs.delete(session);
      }
      const session_ = options.host.open({
        flow: options.flow,
        input: {},
        workspace: options.workspaceOf(session),
        onStep: () => {},
      });
      const run: Run = { flow: options.flow, session: session_ };
      runs.set(session, run);
      void session_.result.then(() => {
        if (runs.get(session) !== run) return;
        runs.delete(session);
        options.onEnd(session);
      });
      const step = stepAt(run);
      if (step === null) throw new Error('流程一步都走不了，检查定义');
      return step;
    },

    provide(session, value) {
      const run = runs.get(session);
      if (run === undefined) return false;
      const position = run.session.current();
      if (position === null) return false;
      return run.session.provide(position.stepId, value);
    },

    async advance(session, value) {
      const run = runs.get(session);
      if (run === undefined) return null;
      const before = run.session.current()?.stepId ?? undefined;
      if (before === undefined) return null;
      if (!run.session.provide(before, value)) return null;
      for (let round = 0; round < 20; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const after = run.session.current()?.stepId ?? undefined;
        if (after !== before) return after === undefined ? null : runs.get(session) === undefined ? null : stepAt(run);
      }
      return stepAt(run);
    },

    stop(session) {
      const run = runs.get(session);
      if (run === undefined) return;
      run.session.abort();
      runs.delete(session);
    },
  };
}
