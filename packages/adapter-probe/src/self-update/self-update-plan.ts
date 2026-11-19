import { bootFileIn, RELEASE_PACKAGES, upFileIn, workbenchRoot, workbenchSelfUpdateMarker } from '@dsh-workbench/shared/host';
import type { SelfUpdatePaths, SelfUpdateRequest, SelfUpdateStart, UpdateJournalState } from '@dsh-workbench/shared/host';
import { join } from 'node:path';
import { type SelfUpdateCli, cliCommand, isPathDsh } from './self-update-cli.js';
import type { SelfUpdateReason, SelfUpdateState } from '@dsh-workbench/shared/contract/protocol/bundle-install';

const PATH_DSH: SelfUpdateCli = { file: 'dsh', args: [], env: {} };

const WORKSHOP_TOOLCHAIN = '@dsh-workbench/module-tools';

export const SELF_UPDATE_PACKAGES = RELEASE_PACKAGES.filter((name) => name !== WORKSHOP_TOOLCHAIN);

export const CORE_ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'] as const;

export type { SelfUpdatePaths, SelfUpdateRequest, SelfUpdateStart };

export interface SelfUpdateMarker extends SelfUpdateRequest {
  readonly pid?: number | undefined;
  readonly state: SelfUpdateState;
  readonly migration?: boolean | undefined;
  readonly version: string;
  readonly reason?: SelfUpdateReason | undefined;
  readonly phase?: UpdateJournalState | undefined;
  readonly committed?: boolean | undefined;
  readonly at: string;
}

export function selfUpdatePaths(): SelfUpdatePaths {
  const dir = workbenchRoot();
  return {
    dir,
    planFile: join(dir, 'self-update-plan.json'),
    marker: workbenchSelfUpdateMarker(),
    log: join(dir, 'self-update.log'),
    versionsDir: join(dir, 'versions'),
  };
}

export function selfUpdateBootFile(dir: string = workbenchRoot()): string {
  return bootFileIn(dir);
}

export function selfUpdateUpFile(dir: string = workbenchRoot()): string {
  return upFileIn(dir);
}

export function recoveryCommand(input: {
  readonly profile: string;
  readonly pkg: string;
  readonly version: string;
  readonly cli?: SelfUpdateCli | undefined;
}): string {
  const cli = input.cli ?? PATH_DSH;
  const command = isPathDsh(cli) ? 'dsh' : cliCommand(cli);
  return `${command} plugin --profile ${input.profile} add ${input.pkg}@${input.version}`;
}

export function selfUpdateRequestProblem(request: SelfUpdateRequest): string | undefined {
  const from = request.from.trim();
  const to = request.to.trim();
  if (from === '') {
    return '读不到当前安装的工作台版本 —— 先在市场里点一次「重新检查」，再试更新。';
  }
  if (request.running !== undefined && request.running !== from) {
    const same = to === '' || to === from;
    if (same) return '这个版本已经安装，请先重启工作台再更新。';
  }
  return undefined;
}

export function selfUpdateMarker(
  request: SelfUpdateRequest,
  state: SelfUpdateState,
  version: string,
  at: string,
  migration?: boolean | undefined,
): SelfUpdateMarker {
  return { ...request, state, version, at, ...(migration === true ? { migration: true } : {}) };
}
