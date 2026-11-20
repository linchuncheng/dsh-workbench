import type { FlowNodeStep, ReadmeDraft } from '@dsh-workbench/shared/host';
import { positionOf, titleOf } from './position';
import type { DiyFlowRuns } from './runs';

export type Destination = 'ready' | 'once' | 'reroute' | 'board' | 'headless' | 'tweak';

export interface PlanInput extends ReadmeDraft {
  readonly destination: Destination;
  readonly cells?: string | undefined;
  readonly steps?: string | undefined;
  readonly minutes?: string | undefined;
}

const NEXT: Readonly<Record<string, string>> = {
  probe: '站探完成后提交读取到的站点',
  plan: '补上方案四段与 ascii',
  build: '开始编写模块',
  install: '安装并显示到面板',
  verify: '执行一遍检查',
  ledger: '保存设计记录',
};

function nextOf(step: string, destination: Destination): string {
  if (step === 'plan' && destination === 'tweak') return '补上四段变化与改之后的 ascii';
  return NEXT[step] ?? step;
}

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
  const buildable = ['board', 'headless', 'tweak'].includes(input.destination);

  if (running !== null) {
    if (runs.inputOf(session)['summary'] !== input.summary) {
      runs.stop(session);
    } else if (at === 'plan') {
      const planned = await runs.advance(session, planValue(input));
      if (!planned.ok) return refused(input, planned.problem ?? '方案未提交');
      return advanced(planned.step, input.destination);
    } else if (at !== null) {
      const position = positionOf(at, input.destination, runs.valuesOf(session));
      return refused(
        input,
        `当前停在第 ${position.index}/${position.total} 步（${running.title ?? at}）；这一步用 workbench_diy_step 提交`,
      );
    }
  }

  if (!buildable) {
    const short: Record<string, string> = {
      ready: '使用现成模块，直接展示给用户',
      once: '一次性任务，完成后说明结果',
      reroute: '改道，告知用户这一步不走面板',
    };
    return {
      ok: true,
      step: null,
      index: 0,
      total: 0,
      remaining: 0,
      done: true,
      text: `判定为「${short[input.destination] ?? input.destination}」，流程到此结束：本次不进入面板。`,
    };
  }

  runs.start(session, { destination: input.destination, summary: input.summary });
  const first = runs.stepOf(session);
  if (first?.id === 'plan' && hasPlanValue(input)) {
    const planned = await runs.advance(session, planValue(input));
    if (!planned.ok) return refused(input, planned.problem ?? '方案未提交');
    return advanced(planned.step, input.destination);
  }
  return advanced(first, input.destination);
}

function hasPlanValue(input: PlanInput): boolean {
  return (
    input.shots !== undefined ||
    input.see !== undefined ||
    input.do !== undefined ||
    input.agent !== undefined ||
    input.data !== undefined
  );
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
      text: '流程已完成。',
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
    text: `停在第 ${position.index}/${position.total} 步（${titleOf(step.id, destination)}）。下一步：${nextOf(
      step.id,
      destination,
    )}。`,
  };
}
