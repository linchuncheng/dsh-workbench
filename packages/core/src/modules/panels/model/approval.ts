import type { ApprovalCall, ApprovalDetail, ApprovalVerdict } from '@dsh-workbench/shared/host';
import {
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_STOP_TOOL,
  DIY_TOOLS,
  LONG_TASKS_STOP_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  MARKET_ENABLE_TOOL,
  MARKET_DISABLE_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_PUBLISH_TOOL,
} from '../unit';
import type { MarketSourceConfig } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { LongTaskRunsLookup } from './long-task-tools';
import { publishVerdict } from './publish-approval';
import { approvalPrecheckOf, type PanelApprovalProbes } from './approval-prechecks';

export { publishVerdictFor } from './publish-approval';
export type {
  PublishApprovalPreview,
  PublishPreflightAsk,
  PublishPreflightLookup,
  PublishPreviewAsk,
  PublishPreviewLookup,
} from './publish-approval';

const SPEC_LIMIT = 80;

const TARGET_LIMIT = 20;

interface Pair {
  readonly zh: string;
  readonly en: string;
}

function missing(id: string | undefined): boolean {
  return id === undefined || id === '';
}

function pad(token: string): string {
  return token.startsWith('[') ? ` ${token} ` : token;
}

export function pair(zh: string, en: string): ApprovalDetail {
  return { zh, en };
}

function workbenchModule(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台模块', en: 'the workbench module' }
    : { zh: `工作台${pad(`[${id}]`)}模块`, en: `the workbench [${id}] module` };
}

function workbenchPlugin(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台的插件', en: 'a workbench plugin' }
    : { zh: `工作台${pad(`[${id}]`)}插件`, en: `the workbench [${id}] plugin` };
}

function workbenchDependency(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台共用依赖', en: 'a workbench shared dependency' }
    : { zh: `工作台共用依赖 [${id}]`, en: `the workbench shared dependency [${id}]` };
}

function workbenchPanelRow(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台在当前项目的面板', en: "the workbench panel for this project" }
    : { zh: `工作台${pad(`[${id}]`)}模块条目`, en: `the workbench [${id}] module entry` };
}

function specOf(raw: Record<string, unknown>): string {
  const spec = typeof raw['spec'] === 'string' ? raw['spec'].replace(/\s+/g, ' ').trim() : '';
  if (spec === '') return '';
  return spec.length > SPEC_LIMIT ? `${spec.slice(0, SPEC_LIMIT)}…` : spec;
}

function boardName(scope: string | undefined): Pair {
  return scope === 'machine'
    ? { zh: '机器级默认值', en: 'the machine-level defaults' }
    : { zh: '当前项目的面板', en: "this project's panel" };
}

export function argsOf(call: ApprovalCall): Record<string, unknown> {
  const raw = call.arguments;
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

const HEADLINE_MAX = 15;

export function askOf(
  reason: string,
  question: ApprovalDetail,
  fallback: ApprovalDetail,
  headline?: ApprovalDetail,
): ApprovalVerdict {
  return { kind: 'ask', reason, question, fallback, ...(headline === undefined ? {} : { headline }) };
}

function headlineOf(zh: string, en: string): ApprovalDetail {
  return { zh, en };
}

function shortHeadline(zh: string, en: string, id: string | undefined): ApprovalDetail {
  const suffix = id === undefined || id === '' ? '' : ` ${id}`;
  const headline = { zh: `${zh}${suffix}`, en: `${en}${suffix}` };
  return [...headline.zh].length <= HEADLINE_MAX ? headline : headlineOf(zh, en);
}

function panelHeadline(actionZh: string, actionEn: string, id: string | undefined): ApprovalDetail {
  const base = headlineOf(`${actionZh}面板`, `${actionEn} panel`);
  if (id === undefined || id === '') return base;
  const headline = headlineOf(`${actionZh} ${id} 面板`, `${actionEn} ${id} panel`);
  return [...headline.zh].length <= HEADLINE_MAX ? headline : base;
}

function updateAsk(
  tool: string,
  id: string | undefined,
  noun: string,
  target: Pair,
  headline: ApprovalDetail,
): ApprovalVerdict {
  return askOf(
    `${tool} ${id ?? ''} updates ${noun} on this machine`,
    pair(`会更新${target.zh}，允许吗？`, `it updates ${target.en}. Allow?`),
    pair(`agent 想更新${target.zh}，允许吗？`, `The agent wants to update ${target.en}. Allow?`),
    headline,
  );
}

function textOf(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value.trim() : '';
}

function clipped(text: string): string {
  const chars = [...text];
  return chars.length > TARGET_LIMIT ? `${chars.slice(0, TARGET_LIMIT).join('')}…` : text;
}

function stopVerdict(call: ApprovalCall, runs: LongTaskRunsLookup | undefined): ApprovalVerdict {
  const raw = argsOf(call);
  const unit = textOf(raw, 'unit');
  const id = textOf(raw, 'id');
  if (unit === '' || id === '') return { kind: 'allow' };
  const run = runs?.().get(unit)?.snapshot(id) ?? null;
  if (runs !== undefined && run === null) return { kind: 'allow' };
  const session = run?.session ?? '';
  if (session !== '' && session === call.session) return { kind: 'allow' };
  const target = run === null ? '' : run.target.trim();
  const where =
    target === ''
      ? `工作台 [${unit}] 的一个长任务`
      : `工作台 [${unit}] 的「${clipped(target)}」长任务`;
  const whereEn =
    target === ''
      ? `a long-running workbench job [${unit}]`
      : `a long-running workbench job [${unit}] "${clipped(target)}"`;
  const origin = session === '' ? '由用户发起' : '由其他会话发起';
  const originEn = session === '' ? 'the user started' : 'another session started';
  return askOf(
    `${LONG_TASKS_STOP_TOOL} ${unit} stops a long run someone else started`,
    pair(`会停止${where}，${origin}，允许吗？`, `it stops ${whereEn} ${originEn}. Allow?`),
    pair(
      `agent 想停止${where}，${origin}，允许吗？`,
      `The agent wants to stop ${whereEn} ${originEn}. Allow?`,
    ),
    headlineOf('停止长任务', 'Stop long task'),
  );
}

export type MarketSourceLookup = (id: string | undefined) => MarketSourceConfig | undefined;

export function stopVerdictFor(call: ApprovalCall, longTaskRuns: LongTaskRunsLookup | undefined): ApprovalVerdict | undefined {
  return stopVerdict(call, longTaskRuns);
}

export function approvalVerdict(
  call: ApprovalCall,
  marketSource?: MarketSourceLookup,
  probes?: PanelApprovalProbes,
): ApprovalVerdict | undefined {
  const precheck = approvalPrecheckOf(call, probes ?? {});
  if (precheck !== undefined) return { kind: 'deny', reason: precheck };
  if (call.name === LONG_TASKS_STOP_TOOL) return stopVerdict(call, undefined);
  if (call.name === DIY_PUBLISH_TOOL) return publishVerdict(call);
  if (call.name === DIY_DEBUG_START_TOOL || call.name === DIY_DEBUG_RESUME_TOOL) {
    const starting = call.name === DIY_DEBUG_START_TOOL;
    const unit = argsOf(call)['unit'];
    const target = typeof unit === 'string' && unit !== '' ? ` [${unit}]` : '';
    return askOf(
      `${call.name}${target} takes over the user's screen to debug a workbench module`,
      pair(
        starting
          ? '要占用当前页面开始调试工作台模块，调试期间请留在该页面，允许吗？'
          : '要继续调试并再次占用当前页面，请回到该页面，允许吗？',
        starting
          ? "it takes over your screen to debug on this workspace's board — please stay on that screen. Allow?"
          : 'it needs your screen again to keep debugging — please go back to that screen. Allow?',
      ),
      pair(
        starting
          ? 'agent 要占用你的屏幕，开始调试一个工作台模块，允许吗？'
          : 'agent 要再次占用你的屏幕，继续调试工作台模块，允许吗？',
        starting
          ? 'The agent wants to take over your screen to start debugging a workbench module. Allow?'
          : 'The agent wants your screen again to keep debugging a workbench module. Allow?',
      ),
      starting
        ? shortHeadline('开始调试', 'Start debugging', typeof unit === 'string' ? unit : undefined)
        : shortHeadline('继续调试', 'Resume debugging', typeof unit === 'string' ? unit : undefined),
    );
  }
  if (call.name === DIY_DEBUG_PAUSE_TOOL || call.name === DIY_DEBUG_STOP_TOOL) {
    return { kind: 'allow' };
  }
  if (call.name === DIY_RECORD_PREPARE_TOOL) {
    const raw = argsOf(call);
    const asked = typeof raw['url'] === 'string' ? raw['url'].replace(/\s+/g, ' ').trim() : '';
    const act = typeof raw['doing'] === 'string' ? raw['doing'].replace(/\s+/g, ' ').trim() : '';
    const question = pair(
      '工作台要在下列站点录制一次真实写入并保存请求原文，允许吗？',
      'The workbench records one real write on the site below and saves the raw requests. Allow?',
    );
    return askOf(
      `${DIY_RECORD_PREPARE_TOOL} opens a browser window in front of ${asked} to record one real write` +
        (act === '' ? '' : ` (${act})`),
      question,
      question,
      headlineOf('录制一次写入', 'Record one write'),
    );
  }
  if (
    call.name !== undefined &&
    ((DIY_TOOLS as readonly string[]).includes(call.name) || call.name === PANELS_HIDE_TOOL)
  ) {
    return { kind: 'allow' };
  }
  const raw = argsOf(call);
  const text = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const id = text('id') ?? text('unit');
  const plugin = text('plugin');
  const spec = specOf(raw);
  const scope = text('scope');
  const board = boardName(scope);

  switch (call.name) {
    case PANELS_SHOW_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_SHOW_TOOL} ${id ?? ''} puts a workbench module row on this project's board`,
        pair(`会把${row.zh}加回${board.zh}，允许吗？`, `it puts ${row.en} back on ${board.en}. Allow?`),
        pair(`agent 想把${row.zh}加到${board.zh}，允许吗？`, `The agent wants to put ${row.en} on ${board.en}. Allow?`),
        panelHeadline('添加', 'Add', id),
      );
    }
    case PANELS_HIDE_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_HIDE_TOOL} ${id ?? ''} takes a workbench module row off this project's board`,
        pair(
          `会把${row.zh}从${board.zh}上移除，允许吗？`,
          `it takes ${row.en} off ${board.en} — its card and its tools go too. Allow?`,
        ),
        pair(
          `agent 想移除${row.zh}，允许吗？`,
          `The agent wants to take ${row.en} off the board. Allow?`,
        ),
        panelHeadline('移除', 'Remove', id),
      );
    }
    case PANELS_MOVE_TOOL: {
      const row = workbenchPanelRow(id);
      const index = raw['index'];
      const at = typeof index === 'number' && Number.isInteger(index) && index > 0 ? index : 0;
      const place =
        at === 0 ? { zh: '最前面', en: 'the front' } : { zh: `第 ${at + 1} 位`, en: `position ${at + 1}` };
      return askOf(
        `${PANELS_MOVE_TOOL} ${id ?? ''} reorders the workbench panel`,
        pair(
          `会把${row.zh}移到${board.zh}${at === 0 ? '' : '的'}${place.zh}，允许吗？`,
          `it moves ${row.en} to ${place.en} of ${board.en}. Allow?`,
        ),
        pair(`agent 想把${row.zh}移到${place.zh}，允许吗？`, `The agent wants to move ${row.en} to ${place.en}. Allow?`),
        panelHeadline('移动', 'Move', id),
      );
    }
    case PANELS_RESET_TOOL:
      return askOf(
        `${PANELS_RESET_TOOL} clears the rows this project changed on the workbench panel`,
        pair(
          scope === 'machine' ? '会清空工作台的机器级默认值，允许吗？' : '会清空工作台在当前项目中的面板配置，允许吗？',
          `it clears the rows this project changed on the workbench ${board.en}. Allow?`,
        ),
        pair(
          scope === 'machine'
            ? 'agent 想清空工作台的机器级默认值，允许吗？'
            : 'agent 想清空工作台在当前项目中的面板配置，允许吗？',
          `The agent wants to clear this project's rows on the workbench ${board.en}. Allow?`,
        ),
        headlineOf(
          scope === 'machine' ? '重置机器级面板' : '重置项目面板',
          scope === 'machine' ? 'Reset machine panel' : 'Reset project panel',
        ),
      );
    case PANELS_FOLLOW_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_FOLLOW_TOOL} ${id ?? ''} puts a workbench panel row back to following the machine-level board`,
        pair(`会把${row.zh}恢复为跟随机器级默认值，允许吗？`, `it puts ${row.en} back to following the machine-level board. Allow?`),
        pair(`agent 想将${row.zh}恢复为跟随机器级默认值，允许吗？`, `The agent wants to put ${row.en} back to following the machine-level board. Allow?`),
        panelHeadline('恢复', 'Restore', id),
      );
    }
    case MODULES_INSTALL_TOOL:
    case MODULES_UPDATE_TOOL: {
      const install = call.name === MODULES_INSTALL_TOOL;
      const verb = install ? '安装' : '更新';
      const verbEn = install ? 'installs' : 'updates';
      return askOf(
        `${call.name} ${id ?? ''} changes the plugins and libraries a workbench module declares`,
        pair(
          `会${verb}${workbenchModule(id).zh}需要的插件与库，不替换模块包本身，允许吗？`,
          `it ${verbEn} the plugins the ${workbenchModule(id).en} declares, without replacing its package. Allow?`,
        ),
        pair(
          `agent 想${verb}${workbenchModule(id).zh}需要的插件与库，允许吗？`,
          `The agent wants to ${install ? 'install' : 'update'} the plugins ${workbenchModule(id).en} declares. Allow?`,
        ),
        shortHeadline(
          install ? '安装模块依赖' : '更新模块依赖',
          install ? 'Install module deps' : 'Update module deps',
          id,
        ),
      );
    }
    case MODULES_UNINSTALL_TOOL: {
      const target = workbenchModule(id);
      return askOf(
        `${MODULES_UNINSTALL_TOOL} ${id ?? ''} removes a workbench module from this machine`,
        pair(`会把${target.zh}连同它的包一起卸载，允许吗？`, `it uninstalls ${target.en}, package included. Allow?`),
        pair(`agent 想卸载${target.zh}，允许吗？`, `The agent wants to uninstall ${target.en}. Allow?`),
        shortHeadline('卸载模块', 'Uninstall module', id),
      );
    }
    case MODULES_INSTALL_BUNDLE_TOOL:
      return askOf(
        `${MODULES_INSTALL_BUNDLE_TOOL} ${spec} installs a module package into this profile`,
        pair(`会把 [${spec}] 安装为工作台的模块包，允许吗？`, `it installs [${spec}] as a workbench module package. Allow?`),
        pair(`agent 想安装工作台的模块包 [${spec}]，允许吗？`, `The agent wants to install the workbench module package [${spec}]. Allow?`),
        headlineOf('安装模块包', 'Install module package'),
      );
    case MODULES_UPDATE_DEPENDENCY_TOOL:
      return updateAsk(
        MODULES_UPDATE_DEPENDENCY_TOOL,
        id,
        'a shared dependency',
        workbenchDependency(id),
        shortHeadline('更新共用依赖', 'Update shared dependency', id),
      );
    case MODULES_UPDATE_PLUGIN_TOOL:
      return updateAsk(
        MODULES_UPDATE_PLUGIN_TOOL,
        plugin,
        'a plugin',
        workbenchPlugin(plugin),
        shortHeadline('更新插件', 'Update plugin', plugin),
      );
    case MODULES_UNINSTALL_PLUGIN_TOOL: {
      const target = workbenchPlugin(plugin);
      return askOf(
        `${MODULES_UNINSTALL_PLUGIN_TOOL} ${plugin ?? ''} uninstalls a plugin on this machine`,
        pair(`会卸载${target.zh}，允许吗？`, `it uninstalls ${target.en}. Allow?`),
        pair(`agent 想卸载${target.zh}，允许吗？`, `The agent wants to uninstall ${target.en}. Allow?`),
        shortHeadline('卸载插件', 'Uninstall plugin', plugin),
      );
    }
    case MODULES_UPDATE_WORKBENCH_TOOL:
      return askOf(
        `${MODULES_UPDATE_WORKBENCH_TOOL} replaces the workbench itself with the new version from the registry`,
        pair('会把工作台本身更新到来源上的最新版本，允许吗？', 'it updates the workbench itself to the new version from the registry. Allow?'),
        pair('agent 想把工作台本身更新到来源上的最新版本，允许吗？', 'The agent wants to update the workbench itself from the registry. Allow?'),
        headlineOf('更新工作台', 'Update workbench'),
      );
    case MARKET_ENABLE_TOOL: {
      const id = text('id');
      const source = marketSource?.(id);
      if (marketSource !== undefined && source === undefined) {
        return {
          kind: 'deny',
          reason:
            id === undefined
              ? '这台机器上还没有选中的模块来源。请先在「模块市场 → 发现」中添加并选中一个。'
              : `没有这个模块来源：${id}`,
        };
      }
      if (source !== undefined && source.policy === 'artifacts-in-repo') return { kind: 'allow' };
      if (source !== undefined && source.kind === 'http') {
        return { kind: 'deny', reason: 'HTTP 模块来源只能读取，不能作为发布目的地。' };
      }
      const where =
        source === undefined
          ? {
              zh: id === undefined ? '工作台当前选中的模块来源' : `工作台的模块来源「${id}」`,
              en: id === undefined ? 'the selected workbench index source' : `the workbench index source "${id}"`,
            }
          : {
              zh: `工作台的模块来源「${source.label}」`,
              en: `the workbench index source "${source.label}"`,
            };
      return askOf(
        `${MARKET_ENABLE_TOOL}${source === undefined ? '' : ` ${source.url}`} marks a market index source as a publish destination on this machine`,
        pair(`把${where.zh}设为可发布，允许吗？`, `Make ${where.en} a publish destination. Allow?`),
        pair(
          `会把${where.zh}设为可发布；只修改本机配置，不触碰仓库，允许吗？`,
          `It makes ${where.en} a publish destination on this machine, without touching the repository. Allow?`,
        ),
        headlineOf('模块来源可发布', 'Make source publishable'),
      );
    }
    case MARKET_DISABLE_TOOL: {
      const id = text('id');
      const source = marketSource?.(id);
      if (marketSource !== undefined && source === undefined) {
        return {
          kind: 'deny',
          reason:
            id === undefined
              ? '这台机器上还没有选中的模块来源。请先在「模块市场 → 发现」中添加并选中一个。'
              : `没有这个模块来源：${id}`,
        };
      }
      if (source === undefined) {
        return askOf(
          `${MARKET_DISABLE_TOOL} stops using a market index source as a publish destination on this machine`,
          pair('把工作台当前选中的模块来源改回只读，允许吗？', 'Make the selected workbench index source read-only again. Allow?'),
          pair(
            '会把工作台当前选中的模块来源改回只读；只修改本机配置，不触碰仓库，允许吗？',
            'It makes the selected workbench index source read-only again on this machine, without touching the repository. Allow?',
          ),
          headlineOf('模块来源只读', 'Make source read-only'),
        );
      }
      if (source.kind !== 'git' || source.policy !== 'artifacts-in-repo') return { kind: 'allow' };
      return askOf(
        `${MARKET_DISABLE_TOOL} ${source.url} stops using a market index source as a publish destination on this machine`,
        pair(`把工作台的模块来源「${source.label}」改回只读，允许吗？`, `Make the workbench index source "${source.label}" read-only again. Allow?`),
        pair(
          `会把工作台的模块来源「${source.label}」改回只读；只修改本机配置，不触碰仓库，允许吗？`,
          `It makes the workbench index source "${source.label}" read-only again on this machine, without touching the repository. Allow?`,
        ),
        headlineOf('改回只读', 'Make read-only'),
      );
    }
    default:
      return undefined;
  }
}

