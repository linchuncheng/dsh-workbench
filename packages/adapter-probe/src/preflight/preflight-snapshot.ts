import { join } from 'node:path';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { writeJsonFile } from '@dsh-workbench/shared/host';

export const PREFLIGHT_SNAPSHOT_FILE = 'preflight.json';

export const PREFLIGHT_SNAPSHOT_LOG_LIMIT = 50;

export function preflightSnapshotPath(root: string): string {
  return join(root, PREFLIGHT_SNAPSHOT_FILE);
}

export function persistPreflightSnapshot(root: string, snapshot: PreflightSnapshot): void {
  writeJsonFile(preflightSnapshotPath(root), {
    phase: snapshot.phase,
    at: snapshot.at,
    steps: snapshot.steps.map((step) => ({
      id: step.id,
      status: step.status,
      detail: step.detail ?? null,
      ...(step.label === undefined ? {} : { label: step.label }),
      ...(step.command === undefined ? {} : { command: step.command }),
      ...(step.log === undefined || step.log.length === 0
        ? {}
        : { log: step.log.slice(-PREFLIGHT_SNAPSHOT_LOG_LIMIT) }),
    })),
    paths: snapshot.paths,
    ...(snapshot.failure === undefined ? {} : { failure: snapshot.failure }),
    ...(snapshot.guidance === undefined ? {} : { guidance: snapshot.guidance }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
    ...(snapshot.bridgeIssues === undefined ? {} : { bridgeIssues: [...snapshot.bridgeIssues] }),
    ...(snapshot.hostGap === undefined ? {} : { hostGap: snapshot.hostGap }),
    ...(snapshot.hostFacts === undefined ? {} : { hostFacts: snapshot.hostFacts }),
    ...(snapshot.diyGap === undefined ? {} : { diyGap: snapshot.diyGap }),
    ...(snapshot.canWakeBrowser === undefined ? {} : { canWakeBrowser: snapshot.canWakeBrowser }),
    ...(snapshot.extensionDir === undefined ? {} : { extensionDir: snapshot.extensionDir }),
  });
}
