import {
  DIY_SHOW_TOOL,
  DIY_STATE_TOOL,
  PANELS_SHOW_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
} from '../unit';
import type { PackEntry } from './toolbox';

export function packClosedReason(tool: string, pack: PackEntry): string {
  const summary = pack.hint.replace(/[。；，、]+$/, '');
  const what = summary === '' ? '' : `（${summary}）`;
  return (
    `${tool} 收在 ${pack.id} 工具包里${what}，这次会话没开：调 ${TOOLBOX_OPEN_TOOL}（targets: ["${pack.id}"]）开包，` +
    `开完重调一次；不确定还有哪些包就先 ${TOOLBOX_LIST_TOOL}。`
  );
}

export function diyManageAbsentReason(tool: string): string {
  return (
    `${tool} 在 DIY 会话里不提供：manage 包只给普通会话，无法在这里开启，不要尝试开启。` +
    'DIY 里能用的管理能力是借来的那七把（收起来 / 看市场与已装 / 装包 / 装插件库 / 卸模块 / 看长任务 / 停长任务）；' +
    '更新模块、换实现、插件装卸、市场源配置、调面板顺序这些回普通会话做。'
  );
}

export function offBoardReason(tool: string, unit: string, diy = false): string {
  if (diy) {
    return (
      `${tool} 所属的 ${unit} 不在板子上，工具不进上下文：先 ${DIY_SHOW_TOOL} 把模块显示到面板上，` +
      `再重调一次。`
    );
  }
  return (
    `${tool} 所属的 ${unit} 不在板子上，工具不进上下文：先 ${PANELS_SHOW_TOOL} 把模块启用到面板上，` +
    `再 ${TOOLBOX_OPEN_TOOL} 开它的工具包。`
  );
}

export function absentScreenReason(tool: string): string {
  return (
    `${tool} 在这台 dsh 上不存在：没探到页面调试能力，调试与日志那一族不会出现。` +
    `看页面用 ${DIY_STATE_TOOL} 的 read=<地址>，取证走录制（workbench_diy_record_*）。`
  );
}
