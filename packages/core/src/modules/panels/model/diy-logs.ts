import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import { OUTPUT, plainJson } from './diy-context';
import { pageAt } from './diy-page';
import { actBrowser, actErrorOf } from './diy-browser-act';
import { DIY_LOGS_READ_TOOL, DIY_LOGS_STOP_TOOL, DIY_LOGS_WATCH_TOOL } from '../unit';

const LOGS_KEY = '__dshDiyLogs';
const LOGS_CAP = 200;
const LOGS_TEXT_MAX = 400;
const LOGS_SHOW = 50;
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

export const LOGS_ARM_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(LOGS_KEY)};
  const CAP = ${String(LOGS_CAP)};
  const TEXT_MAX = ${String(LOGS_TEXT_MAX)};
  const LEVELS = ${JSON.stringify(LEVELS)};
  let buf = window[KEY];
  if (!Array.isArray(buf)) {
    buf = [];
    window[KEY] = buf;
  }
  const textOf = (value) => {
    try {
      if (typeof value === 'string') return value;
      const json = JSON.stringify(value);
      return typeof json === 'string' ? json : String(value);
    } catch (error) {
      return '[unprintable]';
    }
  };
  let hooked = 0;
  for (const level of LEVELS) {
    const current = console[level];
    if (typeof current === 'function' && current.__dshDiy === true) continue;
    const real = typeof current === 'function' ? current.bind(console) : () => {};
    const patched = (...args) => {
      try {
        buf.push({ level, text: args.map(textOf).join(' ').slice(0, TEXT_MAX), at: Date.now() });
        if (buf.length > CAP) buf.splice(0, buf.length - CAP);
      } catch (error) {}
      return real(...args);
    };
    patched.__dshDiy = true;
    patched.__real = typeof current === 'function' ? current : null;
    console[level] = patched;
    hooked += 1;
  }
  return { ok: true, cap: CAP, levels: LEVELS.length, hooked, size: buf.length };
})()`;

export const LOGS_READ_SCRIPT = `(() => {
  const buf = window[${JSON.stringify(LOGS_KEY)}];
  if (!Array.isArray(buf)) return { ok: false, code: 'not-armed', seen: 0, lines: [] };
  return { ok: true, seen: buf.length, lines: buf.slice(-${String(LOGS_CAP)}) };
})()`;

export const LOGS_STOP_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(LOGS_KEY)};
  const LEVELS = ${JSON.stringify(LEVELS)};
  const buf = window[KEY];
  const dropped = Array.isArray(buf) ? buf.length : 0;
  let unhooked = 0;
  for (const level of LEVELS) {
    const current = console[level];
    if (typeof current !== 'function' || current.__dshDiy !== true) continue;
    if (typeof current.__real === 'function') console[level] = current.__real;
    else delete console[level];
    unhooked += 1;
  }
  try {
    delete window[KEY];
  } catch (error) {
    window[KEY] = undefined;
  }
  return { ok: true, unhooked, dropped };
})()`;

export interface LogLine {
  readonly level: string;
  readonly text: string;
  readonly at: number;
}

export interface LogsRead {
  readonly ok: boolean;
  readonly code: string;
  readonly seen: number;
  readonly lines: readonly LogLine[];
}

export function logsReadOf(payload: Record<string, unknown> | undefined): LogsRead {
  const raw = payload ?? {};
  const lines = Array.isArray(raw['lines']) ? raw['lines'] : [];
  const kept: LogLine[] = [];
  for (const one of lines) {
    if (typeof one !== 'object' || one === null) continue;
    const record = one as Record<string, unknown>;
    const text = typeof record['text'] === 'string' ? record['text'] : '';
    if (text === '') continue;
    kept.push({
      level: typeof record['level'] === 'string' && record['level'] !== '' ? record['level'] : 'log',
      text,
      at: typeof record['at'] === 'number' ? record['at'] : 0,
    });
  }
  const seen = typeof raw['seen'] === 'number' ? raw['seen'] : kept.length;
  return {
    ok: raw['ok'] === true,
    code: typeof raw['code'] === 'string' ? raw['code'] : '',
    seen: Math.max(seen, kept.length),
    lines: kept,
  };
}

export function renderLogs(read: LogsRead): string {
  if (!read.ok) {
    return (
      '这一页还没有安装钩子，无法读取控制台。先调用 workbench_diy_logs_watch，' +
      '执行要观察的操作，再调用 workbench_diy_logs_read。'
    );
  }
  if (read.lines.length === 0) {
    return '钩子已安装，但这一页到现在一条 console.* 记录都没有。';
  }
  const shown = read.lines.slice(-LOGS_SHOW);
  const more =
    read.seen > shown.length ? `（共 ${String(read.seen)} 条，这里只列最近 ${String(shown.length)} 条）` : '';
  return [
    `这一页最近 ${String(shown.length)} 条控制台${more}：`,
    ...shown.map((one) => `[${one.level}] ${one.text}`),
  ].join('\n');
}

export function registerLogTools(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  const sessionProp = { type: 'string', description: '会话名；默认 workbench，一般不用填。' };
  const schema = {
    type: 'object',
    properties: { session: sessionProp },
    additionalProperties: false,
  };

  async function run(exec: DshToolRunContext, raw: unknown, script: string) {
    const page = await pageAt(ctx, exec, raw, { requireUnit: false, requireWorkbench: false });
    const step = await actBrowser(page.seam, page.command, page.session, ['eval', script], undefined, page.wire);
    return { page, step };
  }

  const watchTool: DshToolDefinition = {
    name: DIY_LOGS_WATCH_TOOL,
    description: '监听本页控制台（最多 200 条，单条截 400 字，刷新后消失）。',
    parameters: schema,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { page, step } = await run(exec, raw, LOGS_ARM_SCRIPT);
      const error = actErrorOf(step);
      const hooked = typeof step.payload?.['hooked'] === 'number' ? step.payload['hooked'] : 0;
      const size = typeof step.payload?.['size'] === 'number' ? step.payload['size'] : 0;
      const text =
        error !== ''
          ? `监听失败：${error}`
          : hooked === 0
            ? `钩子已在监听（已收集 ${String(size)} 条）。执行要观察的操作后用 ${DIY_LOGS_READ_TOOL} 读取。`
            : `已开始监听（安装 ${String(hooked)} 个钩子，最多 ${String(LOGS_CAP)} 条）：执行要观察的操作，` +
              `然后用 ${DIY_LOGS_READ_TOOL} 读取；读完用 ${DIY_LOGS_STOP_TOOL} 卸载。`;
      return plainJson({ workspace: page.root, ok: step.ok && error === '', hooked, cap: LOGS_CAP, text });
    },
  };

  const readTool: DshToolDefinition = {
    name: DIY_LOGS_READ_TOOL,
    description: '读取已收集的控制台记录（最近 50 条）；未安装钩子时明确说明，不算作没有报错。',
    parameters: schema,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { page, step } = await run(exec, raw, LOGS_READ_SCRIPT);
      const error = actErrorOf(step);
      const read = logsReadOf(step.payload);
      const text = error !== '' ? `读不到：${error}` : renderLogs(read);
      return plainJson({
        workspace: page.root,
        ok: step.ok && error === '',
        seen: read.seen,
        lines: read.lines.slice(-LOGS_SHOW),
        text,
      });
    },
  };

  const stopTool: DshToolDefinition = {
    name: DIY_LOGS_STOP_TOOL,
    description: '停止控制台监听：卸载钩子、清空已收集的记录。',
    parameters: schema,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { page, step } = await run(exec, raw, LOGS_STOP_SCRIPT);
      const error = actErrorOf(step);
      const unhooked = typeof step.payload?.['unhooked'] === 'number' ? step.payload['unhooked'] : 0;
      const dropped = typeof step.payload?.['dropped'] === 'number' ? step.payload['dropped'] : 0;
      const text =
        error !== ''
          ? `卸载失败：${error}`
          : `已结束：卸载 ${String(unhooked)} 个钩子、清空 ${String(dropped)} 条记录。`;
      return plainJson({ workspace: page.root, ok: step.ok && error === '', unhooked, dropped, text });
    },
  };

  return [tools.register(watchTool), tools.register(readTool), tools.register(stopTool)];
}
