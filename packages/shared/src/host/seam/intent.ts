/**
 * 执行缝的语义写入域：调用点只声明自己写哪一类树，不传裸根。
 * 策略合成、环境注入与拒绝处置都住在执行缝模块里。
 */
export type SeamMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface ProductWriteIntent {
  readonly kind: 'product';
}

export interface WorkspaceWriteIntent {
  readonly kind: 'workspace';
}

export interface PathsWriteIntent {
  readonly kind: 'paths';
  readonly paths: readonly string[];
}

export interface NoWriteIntent {
  readonly kind: 'none';
}

export type WriteIntent = ProductWriteIntent | WorkspaceWriteIntent | PathsWriteIntent | NoWriteIntent;

export type DenialScope = 'product' | 'workspace' | 'external' | 'unknown';

export interface SeamPolicy {
  readonly mode: SeamMode;
  readonly workspaceRoot: string;
}

export interface SeamDenial {
  readonly path?: string | undefined;
  readonly scope: DenialScope;
  readonly healed?: boolean | undefined;
}

export interface SeamFact {
  readonly at: number;
  readonly verb: 'run' | 'spawn' | 'open';
  readonly command: string;
  readonly intent: WriteIntent['kind'] | 'host';
  readonly mode: SeamMode | 'host';
  readonly workspaceRoot: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stalled: boolean;
  readonly denial?: SeamDenial | undefined;
}

export type SeamErrorCode =
  | 'workspace-unknown'
  | 'read-only'
  | 'paths-span-trees'
  | 'scope-not-declared'
  | 'sandbox-denied'
  | 'sandbox-unavailable';

export class SeamError extends Error {
  readonly code: SeamErrorCode;
  readonly path?: string | undefined;
  readonly scope?: DenialScope | undefined;

  constructor(code: SeamErrorCode, message: string, extra: { readonly path?: string | undefined; readonly scope?: DenialScope | undefined } = {}) {
    super(message);
    this.name = 'SeamError';
    this.code = code;
    this.path = extra.path;
    this.scope = extra.scope;
  }
}

export type UnitWriteScope = 'unit' | 'workspace';

/** 一次 run 的参数：命令、写到哪、失败怎么办。 */
export interface UnitSeamRequest {
  /** 要执行的 shell 命令。 */
  readonly command: string;
  /** 'unit' 写单元自己的数据根（不用审批）；'workspace' 写当前工作区，要声明并带会话。 */
  readonly scope: UnitWriteScope;
  /** 命令在哪个目录跑；不给用执行缝的默认目录。 */
  readonly workdir?: string | undefined;
  /** 超时毫秒；不给就不加额外超时。 */
  readonly timeoutMs?: number | undefined;
  /** 额外环境变量；会盖在工作台注入的 HOME / 缓存之上。 */
  readonly env?: Readonly<Record<string, string>> | undefined;
  /** 写工作区时必须给：工具里传 exec；路由/动作没有会话，不能请求 workspace。 */
  readonly session?: unknown;
  /** 取消信号；有人按停时 abort。 */
  readonly signal?: AbortSignal | undefined;
  /** 'safe' 只给幂等 / 只读命令，失败时可安全重试；默认 'never'。 */
  readonly retry?: 'safe' | 'never' | undefined;
}

export function productWrite(): WriteIntent {
  return { kind: 'product' };
}

export function workspaceWrite(): WriteIntent {
  return { kind: 'workspace' };
}

export function pathsWrite(paths: readonly string[]): WriteIntent {
  return { kind: 'paths', paths };
}

export function noWrite(): WriteIntent {
  return { kind: 'none' };
}
