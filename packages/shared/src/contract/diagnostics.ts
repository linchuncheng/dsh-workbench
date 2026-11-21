import type { BlockerAction } from './blocker.js';

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

export const DIAG_FALLBACK_CODE = 'DIAG_UNKNOWN_CODE';

const BY_CODE = new Map(DIAG_CODES.map((spec) => [spec.code, spec]));

export function diagSpecOf(code: string): DiagCodeSpec | undefined {
  return BY_CODE.get(code);
}

export function isDiagCode(code: string): boolean {
  return BY_CODE.has(code);
}

export const DIAG_DETAIL_KEYS: readonly string[] = [
  'attempt',
  'cacheAgeMs',
  'count',
  'durationMs',
  'from',
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
  'to',
  'truncated',
  'unit',
  'version',
  'workspace',
  'wroteBytes',
];
