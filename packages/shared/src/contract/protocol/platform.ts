export type Deployment = 'web' | 'desktop';

export type HostOs = 'darwin' | 'win32' | 'linux' | 'other';

export type HostRuntime = 'electron' | 'node';

export type ClientShell = 'electron' | 'browser';

export type ProfileName = 'desktop' | 'web' | 'workbench' | 'headless' | 'other';

export type SelfUpdateCli = 'path-dsh' | 'desktop-cli';

export interface HostCapabilities {
  readonly pageDebug: boolean;
  readonly siteExplore: boolean;
  readonly recording: boolean;
  readonly browserWake: boolean;
  readonly selfUpdateCli: SelfUpdateCli;
  readonly safeMode: boolean;
  readonly fileManager: 'finder' | 'explorer' | 'none';
}

export interface ToolchainPlan {
  readonly node: { readonly source: 'desktop-shim' | 'path' };
  readonly npm: { readonly neededFor: 'runtime-install' };
  readonly pnpm: { readonly neededFor: 'workshop'; readonly expectedMajor: 10 };
}

/** 工作台平台信息：部署形态、系统、运行时、profile、能力、重启提示、工具链。 */
export interface HostSurface {
  /** 'web' 是浏览器里跑，'desktop' 是桌面壳。 */
  readonly deployment: Deployment;
  /** 工作台所在的操作系统；认不出是 'other'。 */
  readonly hostOs: HostOs;
  /** 工作台运行在 Electron 还是 Node 里。 */
  readonly runtime: HostRuntime;
  /** 当前 dsh profile；独立实例是它自己的那个。 */
  readonly profile: ProfileName;
  /** 这份工作台有哪些能力：页面调试 / 站点探索 / 录制 / 浏览器唤醒 / 自更新 / 安全模式 / 文件管理器。 */
  readonly capabilities: HostCapabilities;
  /** 要重启时给用户看的那句话。 */
  readonly restartHint: string;
  /** 工具链计划：node 从哪来、npm/pnpm 什么时候需要。 */
  readonly toolchain: ToolchainPlan;
}

export interface ClientCapabilities {
  readonly debugFooter: boolean;
  readonly macFileManager: boolean;
  readonly primaryModifier: 'meta' | 'ctrl';
}

/** 浏览器侧平台事实。 */
export interface ClientSurface {
  /** 'web' 是浏览器里跑，'desktop' 是桌面壳。 */
  readonly deployment: Deployment;
  /** 'electron' 桌面壳 / 'browser' 浏览器。 */
  readonly shell: ClientShell;
  /** 工作台所在的操作系统；认不出是 'other'。 */
  readonly hostOs: HostOs;
  /** 浏览器侧能力：调试页脚 / 访达 / 主修饰键。 */
  readonly capabilities: ClientCapabilities;
}
