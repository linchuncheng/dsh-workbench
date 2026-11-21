/**
 * 卡住时用户能点的那一下（开链接 / 复制命令 / 重试 / 装或升模块）：由判据产出，卡片照原样渲染。
 */
export type BlockerAction =
  | {
      readonly kind: 'open-url';
      readonly label: string;
      readonly url: string;
      readonly inline?: boolean;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly text: string }
  | { readonly kind: 'retry'; readonly label: string }
  | {
      readonly kind: 'run-fix';
      readonly label: string;
      readonly unit: string;
      readonly fix: 'install' | 'update';
    }
  | { readonly kind: 'open-market'; readonly label: string; readonly unit: string };

/**
 * 一个单元此刻的卡住态：block 顶掉整张卡片，notice 只在角上提示一句；读口与探针产出，卡片消费。
 */
export interface ModuleBlocker {
  readonly id: string;
  readonly severity: 'block' | 'notice';
  readonly title: string;
  readonly hint?: string;
  readonly detail?: string;
  readonly actions: readonly BlockerAction[];
}

export type DiagClass = 'user' | 'env' | 'bug';

export type DiagArea =
  | 'panels'
  | 'market'
  | 'supply'
  | 'preflight'
  | 'self-update'
  | 'settings'
  | 'diag';

export type DiagActionKind = BlockerAction['kind'] | 'open-settings' | 'export-diagnostics';

export type DiagLevel = 'info' | 'warn' | 'error';

export interface DiagCodeSpec {
  readonly code: string;
  readonly class: DiagClass;
  readonly area: DiagArea;
  readonly action: DiagActionKind;
  readonly messageKey: string;
  readonly hintKey?: string;
}

export const DIAG_CLASSES: readonly DiagClass[] = ['user', 'env', 'bug'];

export const DIAG_AREAS: readonly DiagArea[] = [
  'panels',
  'market',
  'supply',
  'preflight',
  'self-update',
  'settings',
  'diag',
];

export const DIAG_ACTIONS: readonly DiagActionKind[] = [
  'open-url',
  'copy',
  'retry',
  'run-fix',
  'open-market',
  'open-settings',
  'export-diagnostics',
];

export const DIAG_LEVELS: readonly DiagLevel[] = ['info', 'warn', 'error'];

export const DIAG_CODES: readonly DiagCodeSpec[] = [
  {
    code: 'READ_FAILED',
    class: 'env',
    area: 'panels',
    action: 'retry',
    messageKey: 'diag.code.readFailed',
    hintKey: 'diag.hint.readFailed',
  },
  {
    code: 'CONFIG_CORRUPT',
    class: 'user',
    area: 'settings',
    action: 'open-settings',
    messageKey: 'diag.code.configCorrupt',
  },
  {
    code: 'MODULE_UNREADABLE',
    class: 'user',
    area: 'market',
    action: 'open-settings',
    messageKey: 'diag.code.moduleUnreadable',
  },
  {
    code: 'MANIFESTS_GAVE_UP',
    class: 'env',
    area: 'panels',
    action: 'retry',
    messageKey: 'diag.code.manifestsGaveUp',
  },
  {
    code: 'SELF_UPDATE_FAILED',
    class: 'env',
    area: 'self-update',
    action: 'retry',
    messageKey: 'diag.code.selfUpdateFailed',
  },
  {
    code: 'SUPPLY_INSTALL_FAILED',
    class: 'env',
    area: 'supply',
    action: 'retry',
    messageKey: 'diag.code.supplyInstallFailed',
  },
  {
    code: 'DIAG_BAD_PARAM',
    class: 'user',
    area: 'diag',
    action: 'retry',
    messageKey: 'diag.code.badParam',
  },
  {
    code: 'DIAG_SINK_FAILED',
    class: 'bug',
    area: 'diag',
    action: 'export-diagnostics',
    messageKey: 'diag.code.sinkFailed',
  },
  {
    code: 'DIAG_UNKNOWN_CODE',
    class: 'bug',
    area: 'diag',
    action: 'export-diagnostics',
    messageKey: 'diag.code.unknownCode',
  },
];

export interface DiagFilter {
  readonly since?: number;
  readonly until?: number;
  readonly area?: DiagArea;
  readonly class?: DiagClass;
  readonly code?: string;
}

export function diagMatches(
  record: { readonly ts: number; readonly area: DiagArea; readonly class: DiagClass; readonly code: string },
  filter: DiagFilter,
): boolean {
  return (
    (filter.since === undefined || record.ts >= filter.since) &&
    (filter.until === undefined || record.ts <= filter.until) &&
    (filter.area === undefined || record.area === filter.area) &&
    (filter.class === undefined || record.class === filter.class) &&
    (filter.code === undefined || record.code === filter.code)
  );
}

export const DIAG_FALLBACK_CODE = 'DIAG_UNKNOWN_CODE';

const BY_CODE = new Map(DIAG_CODES.map((spec) => [spec.code, spec]));

export function diagSpecOf(code: string): DiagCodeSpec | undefined {
  return BY_CODE.get(code);
}

export function isDiagCode(code: string): boolean {
  return BY_CODE.has(code);
}

export const DIAG_DETAIL_KEYS: readonly string[] = [
  'action',
  'attempt',
  'cacheAgeMs',
  'count',
  'durationMs',
  'fromVersion',
  'os',
  'path',
  'phase',
  'pid',
  'pkg',
  'reason',
  'requestedCode',
  'route',
  'since',
  'sink',
  'stage',
  'toVersion',
  'truncated',
  'unit',
  'version',
  'workspace',
  'wroteBytes',
];
