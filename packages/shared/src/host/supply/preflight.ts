export type PreflightStepId = 'toolchain' | 'cli' | 'bridge' | 'runtime' | 'host' | 'diy' | 'warm';
export type PreflightStepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'failed';
export type PreflightFailure = 'permission' | 'network' | 'missing' | 'host' | 'unknown';
export type PreflightGuidance = 'install' | 'path' | 'shell' | 'host';
export type PreflightBridgeIssue = string;

export interface PreflightStep {
  readonly id: PreflightStepId;
  readonly label?: string;
  readonly status: PreflightStepStatus;
  readonly detail?: string;
  readonly action?: string;
  readonly command?: string;
  readonly log?: readonly string[];
}

export interface PreflightDiyGap {
  readonly rows: readonly string[];
  readonly detail: string;
  readonly command: string;
}

export type PreflightHostTier = 'newer' | 'older';

export type PreflightHostStanding =
  | { readonly tier: 'ok'; readonly log?: readonly string[] }
  | PreflightHostGap;

export interface PreflightHostGap {
  readonly tier: PreflightHostTier;
  readonly runtime: string;
  readonly verified: string;
  readonly command?: string;
  readonly log?: readonly string[];
}

export interface PreflightSnapshot {
  readonly phase: 'idle' | 'checking' | 'installing' | 'ready' | 'failed';
  readonly steps: readonly PreflightStep[];
  readonly at: number;
  readonly error?: string;
  readonly failure?: PreflightFailure;
  readonly guidance?: PreflightGuidance;
  readonly bridgeIssues?: readonly PreflightBridgeIssue[];
  readonly hostGap?: PreflightHostGap;
  readonly diyGap?: PreflightDiyGap;
  readonly canWakeBrowser?: boolean;
  readonly extensionDir?: string;
  readonly log?: readonly string[];
}
