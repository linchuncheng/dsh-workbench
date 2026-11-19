import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import {
  BROWSER_READ_SESSION,
  BROWSER_RECORD_SESSION,
  pathsWrite,
  productWrite,
  seamOf,
  type Seam,
  type WriteIntent,
} from '@dsh-workbench/shared/host';
import { dirname } from 'node:path';
import { objectSchemaOf } from './tool-registry-guard';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { cropPngFile } from '@/shared/api/host/png-crop';
import { asNumber, asRecord, asText, OUTPUT, plainJson } from './diy-context';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { hostOf, LOOK_TIMEOUT_MS, payloadOf, runBrowserStep, wireOf, type Wire } from './diy-browser';
import { retainedTabOf } from './diy-record-tab';
import { clipNote, clipOf, defaultShotPath, deviceClipRect } from './diy-browser-clip';
import { ensureDirOf } from '@/shared/api/host/diy-artifacts';
import { pageAt, type PageHandle } from './diy-page';
import { UNIT_PROP } from './diy-schema';
import { cardSelectorOf } from './diy-scripts';
import {
  DIY_CLICK_TOOL,
  DIY_DIALOG_TOOL,
  DIY_EVAL_TOOL,
  DIY_FILL_TOOL,
  DIY_FIND_TOOL,
  DIY_HOVER_TOOL,
  DIY_HTML_TOOL,
  DIY_KEYS_TOOL,
  DIY_NETWORK_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_SCROLL_TOOL,
  DIY_STATE_TOOL,
  DIY_TYPE_TOOL,
  DIY_WAIT_TOOL,
  type PanelsToolName,
} from '../unit';

const DEFAULT_TIMEOUT_MS = 30000;
const CARD_TAIL = ' .wb-card';
const VIEWPORT_SCRIPT = '({ dpr: window.devicePixelRatio, width: window.innerWidth, height: window.innerHeight })';

export const CARD_TOKEN = '$card';

export type CssTarget =
  | { readonly kind: 'positional'; readonly at: number; readonly onlyWhenFirst?: string | undefined }
  | { readonly kind: 'flag'; readonly flag: string };

export interface BrowserToolRow {
  readonly tool: PanelsToolName;
  readonly verb: readonly string[];
  readonly description: string;
  readonly argsHelp: string;
  readonly css?: CssTarget | undefined;
  readonly evalInCard?: boolean | undefined;
  readonly clip?: boolean | undefined;
}

export function cardSelectorIn(unit: string): string {
  return `${cardSelectorOf(unit)}${CARD_TAIL}`;
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((one) => asText(one)).filter((one) => one !== '');
}

function withToken(argv: readonly string[], card: string): string[] {
  return argv.map((one) => one.split(CARD_TOKEN).join(card));
}

function prefixValue(argv: readonly string[], flag: string, card: string): string[] {
  const at = argv.indexOf(flag);
  if (at !== -1) {
    const value = argv[at + 1];
    if (value === undefined || value.startsWith('-')) return [...argv.slice(0, at + 1), card, ...argv.slice(at + 1)];
    return [...argv.slice(0, at + 1), `${card} ${value}`, ...argv.slice(at + 2)];
  }
  const joined = `${flag}=`;
  const eq = argv.findIndex((one) => one.startsWith(joined));
  if (eq !== -1) {
    return argv.map((one, index) => (index === eq ? `${joined}${card} ${one.slice(joined.length)}` : one));
  }
  return [...argv, flag, card];
}

function prefixPositional(argv: readonly string[], at: number, card: string, onlyWhenFirst?: string): string[] {
  if (onlyWhenFirst !== undefined && argv[0] !== onlyWhenFirst) return [...argv];
  const value = argv[at];
  if (value === undefined || value.startsWith('-')) return [...argv];
  return [...argv.slice(0, at), `${card} ${value}`, ...argv.slice(at + 1)];
}

export function evalWrapped(script: string, card: string): string {
  return `(() => { const root = document.querySelector(${JSON.stringify(card)}); if (root === null) return null;\n${script}\n})()`;
}

function wrapFirst(argv: readonly string[], card: string): string[] {
  const first = argv[0];
  if (first === undefined || first.startsWith('-')) return [...argv];
  return [evalWrapped(first, card), ...argv.slice(1)];
}

export function argvOf(row: BrowserToolRow, raw: Record<string, unknown>, unit: string): string[] {
  const card = cardSelectorIn(unit);
  const declared = stringsOf(raw['args']);
  const script = row.evalInCard === true && asText(raw['in']) === 'card' ? wrapFirst(declared, card) : declared;
  const tokens = withToken(script, card);
  if (row.css === undefined || asText(raw['scope']) !== 'card') return tokens;
  if (row.css.kind === 'flag') return prefixValue(tokens, row.css.flag, card);
  return prefixPositional(tokens, row.css.at, card, row.css.onlyWhenFirst);
}

export const BROWSER_TOOLS: readonly BrowserToolRow[] = [
  {
    tool: DIY_STATE_TOOL,
    verb: ['state'],
    description: '查看当前页面：URL / 标题 / 可点击元素及其索引。',
    argsHelp: '转发给 `{cmd}`：--source ax。',
  },
  {
    tool: DIY_HTML_TOOL,
    verb: ['get', 'html'],
    description: '获取 DOM：默认整页 HTML；--as json 返回元素树。',
    argsHelp: '转发给 `{cmd}`：--selector / --as json / --depth / --children-max / --text-max。',
    css: { kind: 'flag', flag: '--selector' },
  },
  {
    tool: DIY_FIND_TOOL,
    verb: ['find'],
    description: '按 CSS 或语义查找元素；ref 仅在当次快照内有效。',
    argsHelp: '转发给 `{cmd}`：--css / --role / --name / --testid / --limit / --text-max。',
    css: { kind: 'flag', flag: '--css' },
  },
  {
    tool: DIY_CLICK_TOOL,
    verb: ['click'],
    description: '点击一个元素。',
    argsHelp: '转发给 `{cmd}`：选择器 / --role / --name / --nth。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_HOVER_TOOL,
    verb: ['hover'],
    description: '将鼠标移到元素上。',
    argsHelp: '转发给 `{cmd}`：选择器 / --role / --name。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_TYPE_TOOL,
    verb: ['type'],
    description: '选中元素后输入文字。',
    argsHelp: '转发给 `{cmd}`：选择器在前，然后是文字。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_FILL_TOOL,
    verb: ['fill'],
    description: '直接把值设进去。',
    argsHelp: '转发给 `{cmd}`：选择器在前，然后是值。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_KEYS_TOOL,
    verb: ['keys'],
    description: '向焦点元素发送按键。',
    argsHelp: '转发给 `{cmd}`：如 Enter / Meta+K。',
  },
  {
    tool: DIY_SCROLL_TOOL,
    verb: ['scroll'],
    description: '滚动一屏（up|down）。',
    argsHelp: '转发给 `{cmd}`：up|down / --amount。',
  },
  {
    tool: DIY_WAIT_TOOL,
    verb: ['wait'],
    description: '等待某个条件：选择器 / 文字 / 时间 / XHR / 下载。',
    argsHelp: '转发给 `{cmd}`：selector|text|time|xhr|download + --timeout。',
    css: { kind: 'positional', at: 1, onlyWhenFirst: 'selector' },
  },
  {
    tool: DIY_EVAL_TOOL,
    verb: ['eval'],
    description: '在页面中执行一段 JS，返回脚本的返回值。',
    argsHelp: '转发给 `{cmd}`：一段 JS（in=card 时可用注入的 root）。',
    evalInCard: true,
  },
  {
    tool: DIY_SCREENSHOT_TOOL,
    verb: ['screenshot'],
    description: '截图并写入文件；传 clip（CSS px）时只截取该区域。',
    argsHelp: '转发给 `{cmd}`：文件路径在前，然后 --full-page / --width / --height / --annotate。',
    clip: true,
  },
  {
    tool: DIY_NETWORK_TOOL,
    verb: ['network'],
    description: '查看捕获的网络请求（URL / 方法 / key）；无法获取请求体，需要时用 _eval 发起请求。',
    argsHelp: '转发给 `{cmd}`：--since / --until / --detail / --filter / --all / --raw / --follow。',
  },
  {
    tool: DIY_DIALOG_TOOL,
    verb: ['dialog'],
    description: '处理 JS 弹窗。',
    argsHelp: '转发给 `{cmd}`：accept | dismiss。',
  },
];

function parametersOf(row: BrowserToolRow, command: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    unit: UNIT_PROP,
    args: { type: 'array', items: { type: 'string' }, description: row.argsHelp.replace('{cmd}', command) },
    timeoutMs: { type: 'number', description: '超时毫秒（默认 30000）。' },
    read: {
      type: 'string',
      description: '只读模式：站点地址；在用户已登录的页面读取（Desktop）。',
    },
  };
  if (row.css !== undefined) {
    properties['scope'] = {
      type: 'string',
      enum: ['page', 'card'],
      description: 'card = 把 CSS 目标限定在该模块界面内；默认 page，原样转发。',
    };
  }
  if (row.evalInCard === true) {
    properties['in'] = {
      type: 'string',
      enum: ['page', 'card'],
      description: 'card = 脚本在模块根节点中执行（注入 root，脚本自行 return）。',
    };
  }
  if (row.clip === true) {
    properties['clip'] = objectSchemaOf(
      {
        x: { type: 'number', description: '左边（CSS px）。' },
        y: { type: 'number', description: '上边（CSS px）。' },
        width: { type: 'number', description: '宽（CSS px）。' },
        height: { type: 'number', description: '高（CSS px）。' },
      },
      {
        required: ['x', 'y', 'width', 'height'],
        additionalProperties: false,
        description: '只截取该区域：先整屏截图再本地裁剪；区域不在视口内时退回整屏。',
      },
    );
  }
  return { type: 'object', properties, additionalProperties: false };
}

async function viewportOf(page: PageHandle): Promise<{ dpr: number; width: number; height: number }> {
  const step = await runBrowserStep(
    page.seam,
    page.command,
    ['browser', page.session, 'eval', VIEWPORT_SCRIPT, '--window', 'background'],
    LOOK_TIMEOUT_MS,
    page.wire,
  );
  const parsed = payloadOf(step.stdout);
  return {
    dpr: asNumber(parsed?.['dpr']) ?? 1,
    width: asNumber(parsed?.['width']) ?? 0,
    height: asNumber(parsed?.['height']) ?? 0,
  };
}

function needsCardOf(row: BrowserToolRow, raw: Record<string, unknown>): boolean {
  if (row.evalInCard === true && asText(raw['in']) === 'card') return true;
  if (row.css !== undefined && asText(raw['scope']) === 'card') return true;
  return stringsOf(raw['args']).some((one) => one.includes(CARD_TOKEN));
}

async function onSiteOnce(seam: Seam, command: string, site: string, wire?: Wire): Promise<boolean> {
  const step = await runBrowserStep(
    seam,
    command,
    ['browser', BROWSER_READ_SESSION, 'get', 'url', '--window', 'background'],
    LOOK_TIMEOUT_MS,
    wire,
  );
  const want = hostOf(site);
  if (want === '' || hostOf(step.stdout.trim()) === want) return false;
  await runBrowserStep(
    seam,
    command,
    ['browser', BROWSER_READ_SESSION, 'open', site, '--window', 'background'],
    LOOK_TIMEOUT_MS,
    wire,
  );
  return true;
}

function loginHintOf(stdout: string, site: string): string {
  const code = payloadOf(stdout)?.['code'];
  if (code === 'not-logged-in') {
    return `未登录：先在 ${site} 登录，再重新运行（读取模式约定：脚本返回 { ok: false, code: "not-logged-in" }）。`;
  }
  if (code === 'not-on-site') {
    return `当前不在 ${site}：已打开过页面。让用户在该窗口中切换并登录，然后重新运行。`;
  }
  return '';
}

function readRefusalOf(row: BrowserToolRow, raw: Record<string, unknown>): string {
  const cardAsked =
    asText(raw['unit']) !== '' ||
    asText(raw['scope']) === 'card' ||
    asText(raw['in']) === 'card' ||
    stringsOf(raw['args']).some((one) => one.includes(CARD_TOKEN));
  if (cardAsked) {
    return '只读模式没有「用户模块界面」：unit、scope=card、in=card 与 $card 仅在页面调试模式下可用。';
  }
  const clipAsked = row.clip === true && raw['clip'] !== undefined && raw['clip'] !== null;
  return clipAsked ? '只读模式不支持截图裁剪：clip 仅在页面调试模式下可用；提供文件路径时截取整屏。' : '';
}

async function runReadTool(
  row: BrowserToolRow,
  ctx: DshHostContext,
  raw: Record<string, unknown>,
  site: string,
): Promise<Record<string, unknown>> {
  const refused = readRefusalOf(row, raw);
  if (refused !== '') throw new Error(refused);
  const seam = seamOf(ctx);
  if (seam === undefined) throw new Error('本机没有 shell 服务，无法驱动浏览器');
  const command = cliCommandOf(ctx);
  const requested = asNumber(raw['timeoutMs']);
  const timeoutMs = requested !== undefined && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
  const argv = stringsOf(raw['args']);
  const wire = wireOf(ctx);
  const retained = retainedTabOf();
  const onRetained = retained !== null && retained.site !== '' && hostOf(retained.site) === hostOf(site);
  const session = onRetained ? BROWSER_RECORD_SESSION : BROWSER_READ_SESSION;
  const target = onRetained && retained !== null ? ['--tab', retained.tab] : [];
  const opened = onRetained ? false : await onSiteOnce(seam, command, site, wire);
  const step = await runBrowserStep(
    seam,
    command,
    ['browser', session, ...row.verb, ...argv, ...target, '--window', 'background'],
    timeoutMs,
    wire,
  );
  const hint = row.tool === DIY_EVAL_TOOL ? loginHintOf(step.stdout, site) : '';
  return {
    session,
    verb: row.verb.join(' '),
    argv,
    opened,
    ok: step.ok,
    exitCode: step.exitCode,
    timedOut: step.timedOut,
    truncated: step.truncated,
    stdout: hint === '' ? step.stdout : `${step.stdout}\n${hint}`,
    stderr: step.stderr,
  };
}

async function runBrowserTool(
  row: BrowserToolRow,
  ctx: DshHostContext,
  raw: unknown,
  exec: DshToolRunContext,
): Promise<Record<string, unknown>> {
  const args = asRecord(raw);
  const read = asText(args['read']);
  if (read !== '') return runReadTool(row, ctx, args, read);
  const page = await pageAt(ctx, exec, raw, { requireUnit: false });
  if (needsCardOf(row, page.args) && page.unit === '') {
    throw new Error(
      '使用模块作用域（scope=card / $card / in=card）时必须提供 unit；当前工作区有多个模块，无法确定目标模块界面。',
    );
  }
  const requested = asNumber(page.args['timeoutMs']);
  const timeoutMs = requested !== undefined && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
  const argv = argvOf(row, page.args, page.unit);
  const clip = row.clip === true ? clipOf(page.args['clip']) : undefined;
  const clipAsked = row.clip === true && page.args['clip'] !== undefined;
  let file = '';
  let finalArgv = argv;
  let intent: WriteIntent = productWrite();
  if (row.clip === true) {
    const given = argv[0] !== undefined && !argv[0].startsWith('-') ? argv[0] : '';
    if (given === '') {
      file = defaultShotPath(page.artifactsDir, page.unit, Date.now());
      finalArgv = [file, ...argv];
      ensureDirOf(dirname(file));
    } else {
      file = given;
      intent = pathsWrite([file]);
    }
  }
  const step = await runBrowserStep(
    page.seam,
    page.command,
    ['browser', page.session, ...row.verb, ...finalArgv, '--window', 'background'],
    timeoutMs,
    page.wire,
    intent,
  );
  const shot: Record<string, unknown> = {};
  if (row.clip === true) {
    shot['file'] = step.ok ? file : '';
    if (clipAsked && clip === undefined) {
      shot['cropped'] = false;
      shot['cropReason'] = 'clip 不是完整矩形（需 x/y ≥ 0、width/height > 0），已返回整屏图。';
    } else if (clip !== undefined && step.ok) {
      const viewport = await viewportOf(page);
      const note = clipNote(clip, viewport);
      if (note === '') {
        const crop = cropPngFile(file, file, deviceClipRect(clip, viewport.dpr));
        shot['cropped'] = crop.ok;
        shot['cropReason'] = crop.reason;
      } else {
        shot['cropped'] = false;
        shot['cropReason'] = note;
      }
    }
  }
  return {
    workspace: page.root,
    unit: page.unit,
    verb: row.verb.join(' '),
    argv: finalArgv,
    ok: step.ok,
    exitCode: step.exitCode,
    timedOut: step.timedOut,
    truncated: step.truncated,
    stdout: step.stdout,
    stderr: step.stderr,
    ...shot,
  };
}

export function registerBrowserTools(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  const surface = surfaceOf(ctx);
  const commandOf = (row: BrowserToolRow): string => surface?.browser?.(row.verb) ?? `browser ${row.verb.join(' ')}`;
  return BROWSER_TOOLS.map((row) => {
    const definition: DshToolDefinition = {
      name: row.tool,
      description: row.description,
      parameters: parametersOf(row, commandOf(row)),
      output: OUTPUT,
      execute: async (raw: unknown, exec: DshToolRunContext) => plainJson(await runBrowserTool(row, ctx, raw, exec)),
    };
    return tools.register(definition);
  });
}

export { clipNote, clipOf, defaultShotPath, deviceClipRect, type PngClip } from './diy-browser-clip';
