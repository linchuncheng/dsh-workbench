import type { ClientSurface, HostSurface } from '@dsh-workbench/shared';
import { clientSurface } from '@/shared/api/platform/client';
import { useHostSurface } from './use-runtime-capabilities';

/**
 * 卡片看到的平台事实：客户端侧现算，宿主侧从 health 读；没读到之前宿主侧是 `undefined`。
 */
/** 卡片获取平台信息的返回值：浏览器侧 + 工作台侧（可能还没读到）。 */
export interface PlatformView {
  /** 浏览器侧信息，一定有。 */
  readonly client: ClientSurface;
  /** 工作台侧 surface；没读到是 undefined。 */
  readonly host: HostSurface | undefined;
}

/**
 * 卡片里拿平台事实的唯一入口：部署形态 / 能力 / 操作系统的差异按这里的值分叉，别自己读 `window` 或 `process`。
 * @returns `client` 是浏览器侧信息（deployment / shell / 操作系统 / capabilities），`host` 是工作台侧 surface（可能还没读到）。
 */
export function usePlatform(): PlatformView {
  const host = useHostSurface();
  return { client: clientSurface(), host };
}
