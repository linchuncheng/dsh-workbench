import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';

export const PREFLIGHT_SNAPSHOT_FILE = 'preflight.json';

export function readPreflightSnapshot(root: string): unknown | null {
  let text: string;
  try {
    text = readFileSync(join(root, PREFLIGHT_SNAPSHOT_FILE), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return JSON.parse(text) as unknown;
}

export interface PreflightEvidenceStep {
  readonly id: string;
  readonly status: string;
  readonly detail?: string;
  readonly command?: string;
}

export interface PreflightHost {
  readonly profile: string;
  readonly at: number | null;
}

export function preflightHostOf(snapshot: unknown): PreflightHost | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const raw = snapshot as Partial<PreflightSnapshot>;
  const dir = raw.hostFacts?.profileDir;
  const profile = typeof dir === 'string' && dir.trim() !== '' ? basename(dir.trim()) : 'unknown';
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : null;
  return { profile, at };
}

export interface PreflightEvidence {
  readonly phase: string;
  readonly from?: string;
  readonly at?: number;
  readonly failure?: string;
  readonly guidance?: string;
  readonly error?: string;
  readonly steps: readonly PreflightEvidenceStep[];
  readonly diy?: PreflightSnapshot['diyGap'];
  readonly host?: PreflightSnapshot['hostGap'];
  readonly facts?: PreflightSnapshot['hostFacts'];
  readonly paths?: PreflightSnapshot['paths'];
  readonly bridgeIssues?: readonly string[];
  readonly evidence: string;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function stepOf(step: PreflightSnapshot['steps'][number]): PreflightEvidenceStep {
  const full: PreflightEvidenceStep = {
    id: step.id,
    status: step.status,
    detail: step.detail,
    command: step.command,
  };
  return Object.fromEntries(Object.entries(full).filter(([, value]) => value !== undefined)) as PreflightEvidenceStep;
}

export function preflightEvidenceOf(snapshot: unknown, root: string): PreflightEvidence | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const raw = snapshot as Partial<PreflightSnapshot>;
  const phase = textOf(raw.phase);
  if (phase === undefined) return null;
  const host = preflightHostOf(snapshot);
  const full: PreflightEvidence = {
    phase,
    from: host?.profile ?? 'unknown',
    ...(host?.at === null || host?.at === undefined ? {} : { at: host.at }),
    failure: textOf(raw.failure),
    guidance: textOf(raw.guidance),
    error: textOf(raw.error),
    steps: Array.isArray(raw.steps) ? raw.steps.map(stepOf) : [],
    diy: raw.diyGap,
    host: raw.hostGap,
    facts: raw.hostFacts,
    paths: raw.paths,
    bridgeIssues: raw.bridgeIssues,
    evidence: join(root, PREFLIGHT_SNAPSHOT_FILE),
  };
  return Object.fromEntries(Object.entries(full).filter(([, value]) => value !== undefined)) as PreflightEvidence;
}
