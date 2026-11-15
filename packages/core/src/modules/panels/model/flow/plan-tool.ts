import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { sessionIdOf } from '@dsh-workbench/shared/host';
import { DIY_PLAN_TOOL } from '../../unit';
import { plainJson } from '../diy-context';
import { planStep, type Destination } from './plan-step';
import { PROGRESS_OUTPUT } from './progress-output';
import type { DiyFlowRuns } from './runs';

const DESTINATIONS: readonly Destination[] = ['ready', 'once', 'reroute', 'board', 'headless'];

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asShots(value: unknown): { caption: string; ascii: string }[] {
  if (!Array.isArray(value)) return [];
  return value.map((one, at) => {
    const shot = typeof one === 'object' && one !== null ? (one as { caption?: unknown; ascii?: unknown }) : {};
    const caption = asText(shot.caption);
    const ascii = typeof shot.ascii === 'string' ? shot.ascii : '';
    if (caption === '') throw new Error(`invalid plan: shots[${at}].caption 不能为空（卡片 / 设置面 / 审批）`);
    if (ascii.trim() === '') throw new Error(`invalid plan: shots[${at}].ascii 不能为空，画一张空的批卡上看不见`);
    return { caption, ascii };
  });
}

const SECTIONS = [
  ['see', '一眼看到'],
  ['do', '你能做'],
  ['agent', 'AI 能做什么'],
  ['data', '数据从哪来'],
] as const;

function validatedSections(record: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, label] of SECTIONS) {
    const raw = record[key];
    if (!Array.isArray(raw)) throw new Error(`invalid plan: ${key} 要给（${label}）`);
    const items = raw.map((one, at) => {
      if (typeof one !== 'string' || one.trim() === '') {
        throw new Error(`invalid plan: ${key}[${at}] 是空的，删掉或写一句`);
      }
      return one.trim();
    });
    if (items.length === 0) throw new Error(`invalid plan: ${key} 至少要写一条（${label}）`);
    out[key] = items;
  }
  return out;
}

export function registerDiyPlanTool(ctx: DshHostContext, runs: DiyFlowRuns): Array<() => void> {
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) return [];

  const planTool: DshToolDefinition = {
    name: DIY_PLAN_TOOL,
    description:
      '要给她做一个面板模块、动手之前用它：先说清她要什么（先问、等她回答），再判去向。' +
      '一次性任务、用现成的、只是问问题都别调。' +
      '判成看板时整份方案四段（see/do/agent/data）必填，再加一两张 shots；没有看板的模块只写 summary。',
    parameters: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          enum: [...DESTINATIONS],
          description:
            'ready=用现成的 / once=一次性 / reroute=改道 / board=要一块看板卡片 / headless=要能力不要卡片（照样创建、安装）',
        },
        summary: { type: 'string', description: '一句话复述她要什么，用她的话（她说过的原话）。' },
        cells: { type: 'string', description: '看板几格。' },
        steps: { type: 'string', description: '几步：抓一次 → 判定 → 出卡。' },
        minutes: { type: 'string', description: '大概几分钟。' },
        shots: {
          type: 'array',
          description: '样子：一两张字符画（界面真实文案、按屏幕上到下的顺序画），每张带图注。',
          items: {
            type: 'object',
            properties: {
              caption: { type: 'string', description: '图注：卡片 / 设置面 / 审批。' },
              ascii: { type: 'string', description: '这张画本身，用界面上的真实文案。' },
            },
            required: ['caption', 'ascii'],
          },
        },
        see: { type: 'array', description: '她一眼看到什么，整份重发。', items: { type: 'string' } },
        do: { type: 'array', description: '她自己能点或能改的，整份重发。', items: { type: 'string' } },
        agent: {
          type: 'array',
          description: 'AI 能替她做什么（写之前要不要批准），整份重发。',
          items: { type: 'string' },
        },
        data: { type: 'array', description: '数据从哪来、用谁的登录、读还是写，整份重发。', items: { type: 'string' } },
      },
      required: ['destination', 'summary'],
      additionalProperties: false,
    },
    output: PROGRESS_OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec);
      if (session === null) throw new Error('这条会话没有 id，推进不了流程');
      const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const destination = asText(record['destination']) as Destination;
      if (!DESTINATIONS.includes(destination)) {
        throw new Error(`去向只能是：${DESTINATIONS.join(' / ')}`);
      }
      const summary = asText(record['summary']);
      if (summary === '') throw new Error('summary 不能为空：用她的话复述一遍');
      const atPlan = runs.stepOf(session)?.id === 'plan';
      const sections = atPlan ? validatedSections(record) : {};
      const shots = asShots(record['shots']);

      const result = await planStep(runs, session, {
        destination,
        summary,
        ...(asText(record['cells']) === '' ? {} : { cells: asText(record['cells']) }),
        ...(asText(record['steps']) === '' ? {} : { steps: asText(record['steps']) }),
        ...(asText(record['minutes']) === '' ? {} : { minutes: asText(record['minutes']) }),
        ...(shots.length === 0 ? {} : { shots }),
        ...(sections['see'] === undefined ? {} : { see: sections['see'] }),
        ...(sections['do'] === undefined ? {} : { do: sections['do'] }),
        ...(sections['agent'] === undefined ? {} : { agent: sections['agent'] }),
        ...(sections['data'] === undefined ? {} : { data: sections['data'] }),
      });

      if (!result.ok) throw new Error(result.text);
      return plainJson({ ...result, step: result.step ?? '' });
    },
  };

  return [tools.register(planTool)];
}
