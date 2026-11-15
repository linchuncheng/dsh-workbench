import type { FlowNodeStep } from '@dsh-workbench/shared/host';
import { positionOf } from './position';
import type { DiyFlowRuns } from './runs';

export type Destination = 'ready' | 'once' | 'reroute' | 'board' | 'headless';

export interface PlanShot {
  readonly caption: string;
  readonly ascii: string;
}

export interface PlanInput {
  readonly destination: Destination;
  readonly summary: string;
  readonly cells?: string | undefined;
  readonly steps?: string | undefined;
  readonly minutes?: string | undefined;
  readonly shots?: readonly PlanShot[] | undefined;
  readonly see?: readonly string[] | undefined;
  readonly do?: readonly string[] | undefined;
  readonly agent?: readonly string[] | undefined;
  readonly data?: readonly string[] | undefined;
}

const NEXT: Readonly<Record<string, string>> = {
  probe: '做完站探，把读到的站点递上来',
  plan: '把方案四段和字符画补上',
  build: '动工写模块',
  install: '装到面板上',
  verify: '走一遍检查',
  ledger: '留账',
};

export interface PlanResult {
  readonly ok: boolean;
  readonly step: string | null;
  readonly index: number;
  readonly total: number;
  readonly remaining: number;
  readonly done: boolean;
  readonly text: string;
}

export async function planStep(
  runs: DiyFlowRuns,
  session: string,
  input: PlanInput,
): Promise<PlanResult> {
  const running = runs.stepOf(session);
  const at = running?.id ?? null;
  const judged = runs.valuesOf(session)['judge'];
  const known =
    typeof judged === 'object' && judged !== null ? (judged as { summary?: unknown }).summary : undefined;

  if (at !== null && at !== 'judge' && at !== 'plan') {
    if (known === input.summary) {
      return refused(
        input,
        `现在停在第 ${positionOf(at, input.destination).index}/${positionOf(at, input.destination).total} 步（${
          running?.title ?? at
        }），这一步用 workbench_diy_step 递`,
      );
    }
    runs.stop(session);
  }

  if (running === null || runs.stepOf(session) === null) runs.start(session);

  const here = runs.stepOf(session)?.id ?? null;
  if (here === 'plan') {
    const planned = await runs.advance(session, planValue(input));
    if (!planned.ok) return refused(input, planned.problem ?? '方案没递上去');
    return advanced(planned.step, input.destination);
  }

  const started = await runs.advance(session, { destination: input.destination, summary: input.summary });
  if (!started.ok) return refused(input, started.problem ?? '这一次没递上去');
  if (started.step === null) {
    const short: Record<string, string> = {
      ready: '用现成的，直接给她看',
      once: '一次性，做完就把结果说清楚',
      reroute: '改道，告诉她这一步不走面板',
    };
    const position = positionOf(null, input.destination);
    return {
      ok: true,
      step: null,
      index: 0,
      total: position.total,
      remaining: 0,
      done: true,
      text: `判成「${short[input.destination] ?? input.destination}」，流程到此为止：这一单不进面板。`,
    };
  }
  return advanced(started.step, input.destination);
}

function planValue(input: PlanInput): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (input.shots !== undefined) value['shots'] = input.shots;
  if (input.cells !== undefined) value['cells'] = input.cells;
  if (input.steps !== undefined) value['steps'] = input.steps;
  if (input.minutes !== undefined) value['minutes'] = input.minutes;
  if (input.see !== undefined) value['see'] = input.see;
  if (input.do !== undefined) value['do'] = input.do;
  if (input.agent !== undefined) value['agent'] = input.agent;
  if (input.data !== undefined) value['data'] = input.data;
  return value;
}

function refused(input: PlanInput, problem: string): PlanResult {
  const position = positionOf(null, input.destination);
  return {
    ok: false,
    step: null,
    index: 0,
    total: position.total,
    remaining: 0,
    done: false,
    text: problem,
  };
}

function advanced(step: FlowNodeStep | null, destination: Destination): PlanResult {
  if (step === null) {
    const position = positionOf(null, destination);
    return {
      ok: true,
      step: null,
      index: 0,
      total: position.total,
      remaining: 0,
      done: true,
      text: '流程走完了。',
    };
  }
  const position = positionOf(step.id, destination);
  return {
    ok: true,
    step: step.id,
    index: position.index,
    total: position.total,
    remaining: position.remaining,
    done: false,
    text: `停在第 ${position.index}/${position.total} 步（${step.title ?? step.id}）。下一步：${
      NEXT[step.id] ?? step.id
    }。`,
  };
}
