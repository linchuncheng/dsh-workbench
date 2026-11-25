import type { LibNeed } from './needs.js';

/** 从共用依赖里加载模块。 */
export interface LibReader {
  /** 按 need 找已安装版本，加载 entry 指向的模块。 */
  load<T = unknown>(need: LibNeed, entry: string): Promise<T>;
}
