import type { FlowNodeStep } from '@dsh-workbench/shared/host';
import type { DiyFlowRuns } from './runs';

export type Destination = 'ready' | 'once' | 'reroute' | 'board' | 'headless';

export interface PlanInput {
  readonly destination: Destination;
  readonly summary: string;
  readonly cells?: string | undefined;
  readonly steps?: string | undefined;
  readonly minutes?: string | undefined;
  readonly sketch?: string | undefined;
}

export interface PlanResult {
  readonly ok: boolean;
  readonly step: string | null;
  readonly done: boolean;
  readonly text: string;
}

const NEXT: Readonly<Record<string, string>> = {
  judge: '先判去向',
  plan: '补计划',
  probe: '开始站探',
  build: '可以动工了',
  install: '装到面板上',
  verify: '走一遍验收',
  ledger: '留账',
};

export async function planStep(
  runs: DiyFlowRuns,
  session: string,
  input: PlanInput,
): Promise<PlanResult> {
  const running = runs.stepOf(session);
  if (running !== null && running.id !== 'judge' && running.id !== 'plan') {
    runs.stop(session);
  }
  if (runs.stepOf(session) === null) runs.start(session);

  const judged = await runs.advance(session, {
    destination: input.destination,
    summary: input.summary,
  });
  if (!judged.ok) {
    return { ok: false, step: null, done: false, text: judged.problem ?? '这一次没递上去' };
  }
  let step: FlowNodeStep | null = judged.step;
  if (step?.id === 'plan') {
    const planned = await runs.advance(session, {
      ...(input.cells === undefined ? {} : { cells: input.cells }),
      ...(input.steps === undefined ? {} : { steps: input.steps }),
      ...(input.minutes === undefined ? {} : { minutes: input.minutes }),
      ...(input.sketch === undefined ? {} : { sketch: input.sketch }),
    });
    if (!planned.ok) return { ok: false, step: null, done: false, text: planned.problem ?? '计划没递上去' };
    step = planned.step;
  }

  if (step === null) {
    const short: Record<string, string> = {
      ready: '用现成的，直接给她看',
      once: '一次性，做完就把结果说清楚',
      reroute: '改道，告诉她这一步不走面板',
      headless: '没有看板，先说明能做什么',
    };
    return {
      ok: true,
      step: null,
      done: true,
      text: `判成「${short[input.destination] ?? input.destination}」，流程到此为止：这一单不进面板。`,
    };
  }

  return {
    ok: true,
    step: step.id,
    done: false,
    text: `停在第 ${step.id} 步（${step.title ?? step.id}）。下一步：${NEXT[step.id] ?? step.id}。`,
  };
}
