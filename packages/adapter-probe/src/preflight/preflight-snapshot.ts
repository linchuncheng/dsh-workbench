import { join } from 'node:path';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { writeJsonFile } from '@dsh-workbench/shared/host';

export const PREFLIGHT_SNAPSHOT_FILE = 'preflight.json';

export function preflightSnapshotPath(root: string): string {
  return join(root, PREFLIGHT_SNAPSHOT_FILE);
}

export function persistPreflightSnapshot(root: string, snapshot: PreflightSnapshot): void {
  writeJsonFile(preflightSnapshotPath(root), {
    phase: snapshot.phase,
    at: snapshot.at,
    steps: snapshot.steps.map((step) => ({ id: step.id, status: step.status, detail: step.detail ?? null })),
    ...(snapshot.failure === undefined ? {} : { failure: snapshot.failure }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  });
}
