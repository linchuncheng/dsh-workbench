import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { sessionIdOf } from '@dsh-workbench/shared/host';
import { DIY_PLAN_TOOL } from '../../unit';
import { OUTPUT, plainJson } from '../diy-context';
import { planStep, type Destination } from './plan-step';
import type { DiyFlowRuns } from './runs';

const DESTINATIONS: readonly Destination[] = ['ready', 'once', 'reroute', 'board', 'headless'];

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function registerDiyPlanTool(ctx: DshHostContext, runs: DiyFlowRuns): Array<() => void> {
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) return [];

  const planTool: DshToolDefinition = {
    name: DIY_PLAN_TOOL,
    description:
      '动手前先判去向并给计划：是看板、一次性、用现成的、改道、还是没看板。判成看板才会往下走，其余当场收尾。',
    parameters: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          enum: [...DESTINATIONS],
          description: 'ready=用现成的 / once=一次性 / reroute=改道 / board=看板 / headless=没看板',
        },
        summary: { type: 'string', description: '一句话复述她要什么，用她的话。' },
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
      },
      required: ['destination', 'summary'],
      additionalProperties: false,
    },
    output: OUTPUT,
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

      const result = await planStep(runs, session, {
        destination,
        summary,
        ...(asText(record['cells']) === '' ? {} : { cells: asText(record['cells']) }),
        ...(asText(record['steps']) === '' ? {} : { steps: asText(record['steps']) }),
        ...(asText(record['minutes']) === '' ? {} : { minutes: asText(record['minutes']) }),
        ...(asText(record['sketch']) === '' ? {} : { sketch: asText(record['sketch']) }),
      });

      if (!result.ok) throw new Error(result.text);
      return plainJson({ ...result });
    },
  };

  return [tools.register(planTool)];
}
