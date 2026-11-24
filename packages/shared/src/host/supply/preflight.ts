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
  readonly kind: 'older-dsh' | 'broken-row' | 'preset-missing';
  readonly rows: readonly string[];
  readonly detail: string;
  readonly command?: string;
}

export interface PreflightPaths {
  readonly workbenchRoot: string;
  readonly dshHome: string;
}

export interface PreflightHostFacts {
  readonly version?: string;
  readonly from?: string;
  readonly profileDir?: string;
  readonly verified?: string;
}

export type PreflightHostTier = 'newer' | 'older';

export type PreflightHostStanding =
  | { readonly tier: 'ok'; readonly log?: readonly string[]; readonly facts?: PreflightHostFacts }
  | PreflightHostGap;

export interface PreflightHostGap {
  readonly tier: PreflightHostTier;
  readonly runtime: string;
  readonly verified: string;
  readonly command?: string;
  readonly log?: readonly string[];
  readonly facts?: PreflightHostFacts;
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
  readonly hostFacts?: PreflightHostFacts;
  readonly paths?: PreflightPaths;
  readonly diyGap?: PreflightDiyGap;
  readonly canWakeBrowser?: boolean;
  readonly extensionDir?: string;
  readonly log?: readonly string[];
}
