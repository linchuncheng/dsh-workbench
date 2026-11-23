import type { ApprovalCall, DebugState } from '@dsh-workbench/shared/host';
import { debugPrecheckOf } from './diy-debug-tools';
import {
  DIY_DEBUG_START_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_SHOW_TOOL,
} from '../unit';

export interface PanelApprovalProbes {
  readonly switchDenyOf?: ((id: string) => string | undefined) | undefined;
  readonly moduleDenyOf?: ((unit: string) => string | undefined) | undefined;
  readonly debugOf?: (() => DebugState | null) | undefined;
  readonly debugUnitsOf?: ((workspace: string | undefined) => readonly string[]) | undefined;
  readonly pluginDenyOf?: ((name: string, updating: boolean) => string | undefined) | undefined;
  readonly recordUrlDenyOf?:
    | ((ask: { readonly unit: string; readonly url: string; readonly workspace?: string | undefined }) => string | undefined)
    | undefined;
}

const SWITCH_ROWS: readonly string[] = [PANELS_SHOW_TOOL, PANELS_HIDE_TOOL, PANELS_MOVE_TOOL];

const MODULE_ROWS: readonly string[] = [MODULES_INSTALL_TOOL, MODULES_UPDATE_TOOL, MODULES_UNINSTALL_TOOL];

function textOf(call: ApprovalCall, key: string): string {
  const raw = call.arguments;
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

function scopeOf(call: ApprovalCall): string {
  return textOf(call, 'scope');
}

function debugUnitDenyOf(call: ApprovalCall, probes: PanelApprovalProbes): string | undefined {
  if (call.name !== DIY_DEBUG_START_TOOL || probes.debugUnitsOf === undefined) return undefined;
  if (textOf(call, 'unit') !== '') return undefined;
  const units = probes.debugUnitsOf(call.workspace);
  if (units.length === 1) return undefined;
  return `需要一个 unit（已安装的：${units.join(', ') || '（空）'}）`;
}

function rowDenyOf(
  call: ApprovalCall,
  rows: readonly string[],
  lookup: ((id: string) => string | undefined) | undefined,
): string | undefined {
  if (call.name === undefined || !rows.includes(call.name)) return undefined;
  return lookup?.(textOf(call, 'id'));
}

function pluginDenyOf(call: ApprovalCall, probes: PanelApprovalProbes): string | undefined {
  if (probes.pluginDenyOf === undefined) return undefined;
  if (call.name !== MODULES_UPDATE_PLUGIN_TOOL && call.name !== MODULES_UNINSTALL_PLUGIN_TOOL) return undefined;
  return probes.pluginDenyOf(textOf(call, 'plugin'), call.name === MODULES_UPDATE_PLUGIN_TOOL);
}

function recordDenyOf(call: ApprovalCall, probes: PanelApprovalProbes): string | undefined {
  if (call.name !== DIY_RECORD_PREPARE_TOOL) return undefined;
  const url = textOf(call, 'url');
  if (url === '') {
    return '需要该页面的 url（用户访问系统的入口）。先用 workbench_diy_recon 探测，或询问用户通常在哪里查看；不要猜测站点。';
  }
  if (probes.recordUrlDenyOf === undefined) return undefined;
  const unit = textOf(call, 'unit') || 'page';
  return probes.recordUrlDenyOf({
    unit,
    url,
    ...(call.workspace === undefined ? {} : { workspace: call.workspace }),
  });
}

function machineDenyOf(call: ApprovalCall): string | undefined {
  if (scopeOf(call) !== 'machine') return undefined;
  if (call.name === PANELS_MOVE_TOOL) {
    return '机器级默认板没有顺序这一说：它只回答"默认开哪几行"。顺序是每个工作区自己的 —— 要排顺序就用默认作用域的那一次 move（或面板里拖动）。';
  }
  if (call.name === PANELS_FOLLOW_TOOL) {
    return '机器级默认值没有"恢复跟随"这一操作；它本身就是默认值，直接用 show / hide 写入。';
  }
  return undefined;
}

function bundleDenyOf(call: ApprovalCall): string | undefined {
  if (call.name !== MODULES_INSTALL_BUNDLE_TOOL || textOf(call, 'spec') !== '') return undefined;
  return '缺少 spec（包名，可带版本，如 @scope/module@1.2.3）；也可以是 git 地址 / tarball / 本地绝对路径。';
}

export function approvalPrecheckOf(call: ApprovalCall, probes: PanelApprovalProbes): string | undefined {
  return (
    debugPrecheckOf(call, probes.debugOf) ??
    debugUnitDenyOf(call, probes) ??
    rowDenyOf(call, SWITCH_ROWS, probes.switchDenyOf) ??
    machineDenyOf(call) ??
    rowDenyOf(call, MODULE_ROWS, probes.moduleDenyOf) ??
    pluginDenyOf(call, probes) ??
    recordDenyOf(call, probes) ??
    bundleDenyOf(call)
  );
}
