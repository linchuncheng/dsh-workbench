import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { hostSurface, sessionIdOf } from '@dsh-workbench/shared/host';
import { DIY_STEP_TOOL } from '../../unit';
import { plainJson } from '../diy-context';
import { positionOf, titleOf } from './position';
import { PROGRESS_OUTPUT } from './progress-output';
import type { DiyFlowRuns } from './runs';

const STEP_FIELDS: Readonly<Record<string, readonly string[]>> = {
  probe: ['sites'],
  scan: ['needsSupplement', 'gaps'],
  build: ['unit'],
  install: ['unit', 'installed'],
  verify: ['passed', 'unverified'],
  ledger: ['design'],
  finish: ['done'],
};

function nextOf(step: string, destination: string | null): string {
  if (step === 'plan') {
    return destination === 'headless' ? '把方案四段补上（用 workbench_diy_plan）' : '把方案四段和字符画补上（用 workbench_diy_plan）';
  }
  if (step === 'verify' && !hostSurface().capabilities.pageDebug) {
    return '这台机器没有页面调试：按只读取证逐条验，验不了的写进未验';
  }
  return STEP_NEXT[step] ?? step;
}

const STEP_NEXT: Readonly<Record<string, string>> = {
  probe: '做完站探，把读到的站点递上来',
  scan: '检查完录制结果，把「是否需要补录」和缺口一起递上来',
  build: '写完模块，把模块标识递上来',
  install: '安装完成之后，把模块标识与安装结果递上来',
  verify: '走完一遍，把通过的与没验的递上来',
  ledger: '把这次的设计文件名递上来',
  finish: '材料齐了就把 done 递上来；缺口不想掩掉就如实留着',
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function destinationOf(input: Readonly<Record<string, unknown>>): string | null {
  const destination = input['destination'];
  return typeof destination === 'string' ? destination : null;
}

export function registerDiyStepTool(ctx: DshHostContext, runs: DiyFlowRuns): Array<() => void> {
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) return [];

  const stepTool: DshToolDefinition = {
    name: DIY_STEP_TOOL,
    description:
      'DIY 流程往前走一步：把这一步做完的结果递上来，流程才往下走。' +
      '递哪些字段看当前停在哪一步（工具回话里有）；没在流程里就别调。',
    parameters: {
      type: 'object',
      properties: {
        sites: { type: 'array', description: '站探那步：读到了哪些站点 / 表。', items: { type: 'string' } },
        needsSupplement: { type: 'boolean', description: '检查录制结果那一步：本次是否需要再补录一段。' },
        gaps: {
          type: 'array',
          description: '检查录制结果那一步：还缺什么（补录要补的内容），一条一句。',
          items: { type: 'string' },
        },
        unit: { type: 'string', description: '创建与安装那步：模块标识。' },
        installed: { type: 'boolean', description: '安装那步：是否安装成功。' },
        passed: { type: 'array', description: '检查那步：验过且通过的。', items: { type: 'string' } },
        unverified: { type: 'array', description: '检查那步：没验的，写清为什么。', items: { type: 'string' } },
        design: { type: 'string', description: '最后一步：这次设计落到了哪个文件。' },
        cancel: {
          type: 'boolean',
          description: '要终止这条流程时给 true（她改主意了、做不了、或这件事本来就不该做模块）。',
        },
        reason: { type: 'string', description: '终止的原因，一句话，给她看。' },
      },
      additionalProperties: false,
    },
    output: PROGRESS_OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec);
      if (session === null) throw new Error('这条会话没有 id，递不进流程');
      const running = runs.stepOf(session);
      if (running === null) throw new Error('这条会话没有运行中的流程 —— 先用 workbench_diy_plan 起一条');
      const record = asRecord(raw);
      if (record['cancel'] === true) {
        const reason = typeof record['reason'] === 'string' ? record['reason'].trim() : '';
        if (reason === '') throw new Error('要终止就给一句原因：她在卡上会看到这句话');
        runs.stop(session);
        return plainJson({ ok: true, step: '', index: 0, total: 0, remaining: 0, done: true, text: `已终止：${reason}` });
      }
      const fields = STEP_FIELDS[running.id];
      if (fields === undefined) {
        throw new Error(`现在停在「${titleOf(running.id, destinationOf(runs.inputOf(session)))}」，这一步用 workbench_diy_plan 递`);
      }
      const missing = fields.filter((field) => record[field] === undefined);
      if (missing.length > 0) {
        throw new Error(
          `现在停在「${titleOf(running.id, destinationOf(runs.inputOf(session)))}」，要递的是 ${fields.join(' / ')}；缺 ${missing.join(' / ')}`,
        );
      }
      const value: Record<string, unknown> = {};
      for (const field of fields) value[field] = record[field];
      const advanced = await runs.advance(session, value);
      if (!advanced.ok) throw new Error(advanced.problem ?? '这一步没递进去');
      const destination = destinationOf(runs.inputOf(session));
      const step = advanced.step;
      const values = runs.valuesOf(session);
      const at = positionOf(step?.id ?? null, destination, values);
      return plainJson({
        ok: true,
        step: step?.id ?? '',
        index: at.index,
        total: at.total,
        remaining: at.remaining,
        done: step === null,
        text:
          step === null
            ? `流程走完了：共 ${at.total} 步，全部递过。`
            : `停在第 ${at.index}/${at.total} 步（${titleOf(step.id, destination, values)}）。下一步：${
                nextOf(step.id, destination)
              }。`,
      });
    },
  };

  return [tools.register(stepTool)];
}
