import type { HostSurface } from '../../contract/protocol/platform.js';
import type { EnvSupplyPort } from '../adapters/port-types.js';
import type { UnitSeam } from '../seam/unit-seam.js';
import { createFlowHost, type FlowHost } from '../flow/kit.js';
import type { FlowAgentPort, FlowDataPort } from '../flow/types.js';
import type { AiPort } from '../ai/port.js';
import type { DraftStore } from '../drafts/draft-store.js';
import { sessionIdOf, sessionWorkspace } from './tool-kit.js';

/**
 * 宿主 kit 的公共部分：flow、工具侧 session 读法、外部供给装法、宿主平台事实、按 unit 绑定的执行缝门面。
 */
export interface HostKit {
  /** 流程入口：createActions / check / run。 */
  readonly flow: FlowHost;
  /** 从工具执行上下文读会话 id；没有会话时 null。 */
  readonly sessionIdOf: typeof sessionIdOf;
  /** 从工具执行上下文读当前工作区；没有会话时 null。 */
  readonly sessionWorkspace: typeof sessionWorkspace;
  /** 拼共用依赖的安装提示；只展示、不执行。 */
  readonly libInstallCommand: EnvSupplyPort['libInstallCommand'];
  /** 工作台平台信息：deployment / capabilities / toolchain。 */
  readonly surface: HostSurface;
  /** 按 unit 绑定的受控执行缝；清单没声明 host.writes 时是 undefined。 */
  readonly seam?: UnitSeam | undefined;
  /** 模块用的模型入口；这份运行时没有模型时是 undefined。 */
  readonly ai?: AiPort | undefined;
  /** 会话草稿库；没有它就不能把远端文件挂到本地再提交。 */
  readonly drafts?: DraftStore | undefined;
}

/**
 * 建一份宿主 kit；每个挂载点一份，没有模块级状态。
 * @param parts.libInstallCommand 拼「装这个共用依赖」的那条命令。
 * @param parts.surface 宿主平台事实；由组合根按 profile 与宿主进程算好再交进来。
 * @param parts.seam 按 unit 绑定好的执行缝门面；模块清单没声明写入域时缺省不给。
 * @param parts.agents 宿主的 agent 端口；没有就不支持流程里的 agent 节点。
 * @param parts.ai 模块用的模型入口；没有就等于这份运行时没有模型。
 * @param parts.data 模块读数据的窄口；没有就不支持流程里的 data 节点。
 * @param parts.drafts 会话草稿库；没有就不支持「把远端文件挂到本地再提交」那条路。
 * @returns flow / sessionIdOf / sessionWorkspace / libInstallCommand / surface，有门面时带上 seam，有模型时带上 ai，有草稿库时带上 drafts。
 */
export function createHostKit(parts: {
  readonly libInstallCommand: EnvSupplyPort['libInstallCommand'];
  readonly surface: HostSurface;
  readonly seam?: UnitSeam | undefined;
  readonly agents?: FlowAgentPort | undefined;
  readonly ai?: AiPort | undefined;
  readonly data?: FlowDataPort | undefined;
  readonly drafts?: DraftStore | undefined;
}): HostKit {
  const optional: {
    seam?: UnitSeam;
    ai?: AiPort;
    drafts?: DraftStore;
  } = {};
  if (parts.seam !== undefined) optional.seam = parts.seam;
  if (parts.ai !== undefined) optional.ai = parts.ai;
  if (parts.drafts !== undefined) optional.drafts = parts.drafts;
  return {
    flow: createFlowHost({
      ...(parts.agents === undefined ? {} : { agents: parts.agents }),
      ...(parts.ai === undefined ? {} : { ai: parts.ai }),
      ...(parts.data === undefined ? {} : { data: parts.data }),
    }),
    sessionIdOf,
    sessionWorkspace,
    libInstallCommand: parts.libInstallCommand,
    surface: parts.surface,
    ...optional,
  };
}
