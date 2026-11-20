import { toolRegistryOf } from './tool-registry-guard';
import type { DshHostContext, DshToolDefinition, DshToolOutputDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import type { LongTaskBase, LongTaskRegistry } from '@dsh-workbench/shared/host';
import { sessionIdOf, sessionWorkspace } from '@dsh-workbench/shared/host';
import { LONG_TASKS_LIST_TOOL, LONG_TASKS_STOP_TOOL } from '../unit';

export type LongTaskRunsLookup = () => ReadonlyMap<string, LongTaskRegistry<LongTaskBase>>;

const STATUS_WORDS: Readonly<Record<string, string>> = {
  running: '运行中',
  'needs-human': '待处理',
  'needs-login': '需要登录',
  stopped: '已停止',
  ok: '已完成',
  failed: '失败',
};

const NO_WORKSPACE = '读不到当前会话所在的工作区。长任务按工作区记录，无法读取。';

const NO_RUNS = '当前工作区没有运行中的长任务，也没有十分钟内刚结束的。';

const NO_RUN = '没有这条长任务，unit 与 id 不匹配。';

const STALE_REGISTRY = '这一份工作台仍是上一版的注册表，无法停止；重新启动工作台后即可停止。';

const LIST_OUTPUT: DshToolOutputDefinition = {
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      runs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            unit: { type: 'string' },
            id: { type: 'string' },
            target: { type: 'string' },
            status: { type: 'string' },
          },
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  },
  render: (_args: unknown, value: unknown) => [
    {
      type: 'text',
      text:
        typeof (value as { text?: unknown } | null)?.text === 'string'
          ? (value as { text: string }).text
          : JSON.stringify(value),
    },
  ],
};

const STOP_OUTPUT: DshToolOutputDefinition = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string' }, stopped: { type: 'boolean' } },
    additionalProperties: true,
  },
  render: (_args: unknown, value: unknown) => [
    {
      type: 'text',
      text:
        typeof (value as { text?: unknown } | null)?.text === 'string'
          ? (value as { text: string }).text
          : JSON.stringify(value),
    },
  ],
};

interface ListedRun {
  readonly unit: string;
  readonly id: string;
  readonly target: string;
  readonly status: string;
  readonly step: string;
  readonly intervention: string;
  readonly session: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arg(raw: unknown, key: string): string {
  return str(typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : undefined);
}

function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

function originOf(session: string, caller: string | null): string {
  if (session === '') return '用户发起';
  return session === caller ? '本会话发起' : '其他会话发起';
}

function listed(runs: LongTaskRunsLookup | undefined, workspace: string): readonly ListedRun[] {
  const out: ListedRun[] = [];
  for (const [unit, registry] of runs?.() ?? []) {
    for (const row of registry.current(workspace)) {
      const id = str(row['id']);
      const run = id === '' ? null : registry.snapshot(id);
      out.push({
        unit,
        id,
        target: str(row['target']) || str(run?.target),
        status: str(row['status']) || str(run?.status),
        step: str(row['step']) || str(row['why']) || str(run?.step) || str(run?.why),
        intervention: run?.status === 'needs-human' ? str(run.intervention?.title) : '',
        session: str(row['session']) || str(run?.session),
      });
    }
  }
  return out;
}

function lineOf(run: ListedRun, index: number, caller: string | null): string {
  const parts = [
    run.unit,
    run.target,
    statusWord(run.status),
    run.step,
    run.intervention === '' ? '' : `待用户处理：${run.intervention}`,
    run.id === '' ? '' : `id=${run.id}`,
    originOf(run.session, caller),
  ];
  return `${String(index + 1)}. ${parts.filter((part) => part !== '').join(' · ')}`;
}

function renderList(runs: readonly ListedRun[], workspace: string, caller: string | null): string {
  if (runs.length === 0) return NO_RUNS;
  return [
    `当前工作区：${workspace}`,
    ...runs.map((run, index) => lineOf(run, index, caller)),
  ].join('\n');
}

export function registerLongTaskTools(
  ctx: DshHostContext,
  longTaskRuns?: LongTaskRunsLookup | undefined,
): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过工作台长任务工具注册');
  if (tools === undefined) return [];

  const listTool: DshToolDefinition = {
    name: LONG_TASKS_LIST_TOOL,
    description:
      '查看当前工作区运行中的长任务（十分钟内结束的也算）；待处理的行写明用户需要做什么，停止用 workbench_long_tasks_stop。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: LIST_OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const workspace = sessionWorkspace(exec);
      if (workspace === null) return { runs: [], text: NO_WORKSPACE };
      const runs = listed(longTaskRuns, workspace);
      return { runs, text: renderList(runs, workspace, sessionIdOf(exec)) };
    },
  };

  const stopTool: DshToolDefinition = {
    name: LONG_TASKS_STOP_TOOL,
    description:
      '停止一条长任务（unit 与 id 从 workbench_long_tasks_list 获取）。只向模块发送中断信号，' +
      '任务如何收尾由模块决定。',
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: '长任务所属的模块标识（如 inventory）。' },
        id: { type: 'string', description: '长任务 id（列表中 id= 后的值）。' },
      },
      required: ['unit', 'id'],
      additionalProperties: false,
    },
    output: STOP_OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const unit = arg(raw, 'unit');
      const id = arg(raw, 'id');
      if (unit === '' || id === '') return { text: NO_RUN, stopped: false };
      const registry = longTaskRuns?.().get(unit);
      if (registry === undefined || typeof registry.stop !== 'function') {
        return { text: registry === undefined ? NO_RUN : STALE_REGISTRY, stopped: false };
      }
      const run = registry.snapshot(id);
      if (run === null) return { text: NO_RUN, stopped: false };
      if (run.workspace !== sessionWorkspace(exec)) {
        return { text: `这条长任务不在当前工作区（位于 ${run.workspace}），未执行停止。`, stopped: false };
      }
      if (!registry.stop(id, sessionIdOf(exec) ?? undefined)) {
        return { text: `这条长任务已停止运行（${statusWord(run.status)}），未重复执行。`, stopped: false };
      }
      return {
        text: `已停止：${unit} · ${run.target}（${id}）。模块已收到中断信号，何时停止与停在哪一步由模块决定。`,
        stopped: true,
      };
    },
  };

  return [tools.register(listTool), tools.register(stopTool)];
}
