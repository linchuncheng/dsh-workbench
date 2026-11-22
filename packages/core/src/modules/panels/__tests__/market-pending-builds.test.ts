import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pendingBuildsOf, recordPendingBuilds, WorkbenchDataError } from '@dsh-workbench/shared/host';
import type { InstallFailure } from '@dsh-workbench/shared';
import {
  approveBuildsOrProblem,
  pendingBuildsOfError,
  policyDirOf,
  runInstallStep,
} from '../model/market-pending-builds';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-pending-builds-'));
  dirs.push(dir);
  return dir;
}

function failureOf(options: { readonly dir: string; readonly output: string }): WorkbenchDataError {
  const failure: InstallFailure = {
    kind: 'unknown',
    command: `pnpm add --dir '${options.dir}' 'opencli-plugin-demo@1.0.0' --allow-build=opencli-plugin-demo`,
    exitCode: 1,
    output: options.output,
    current: { uid: 0, gid: 0 },
    fix: { kind: 'handoff' },
  };
  return new WorkbenchDataError('install-failed', '命令失败（退出码 1）', {
    detail: options.output,
    failure,
  });
}

describe('被 pnpm 拦下的构建脚本：记账、放行、再重跑', () => {
  it('从命令里认出 --dir（带的引号要不要都行），认不出就是 undefined', () => {
    expect(policyDirOf("pnpm add --dir '/tmp/x' pkg")).toBe('/tmp/x');
    expect(policyDirOf('pnpm add --dir "/tmp/x" pkg')).toBe('/tmp/x');
    expect(policyDirOf('pnpm add --dir /tmp/x pkg')).toBe('/tmp/x');
    expect(policyDirOf("'opencli' plugin update 'demo'")).toBeUndefined();
    expect(policyDirOf(undefined)).toBeUndefined();
  });

  it('批准的名字分得清「这本策略里有」和「哪儿都没有」', () => {
    const first = tempDir();
    const second = tempDir();
    recordPendingBuilds(first, 'Ignored build scripts: sharp');
    recordPendingBuilds(second, 'Ignored build scripts: esbuild');

    expect(approveBuildsOrProblem(['sharp', 'esbuild'], [first, second])).toBeUndefined();
    expect(pendingBuildsOf(first)).toEqual([]);
    expect(pendingBuildsOf(second)).toEqual([]);
    expect(approveBuildsOrProblem(['sharp', '手抖写错'], [first, second])).toContain('手抖写错');
  });

  it('跑失败时先记账再抛：错误里带待批清单，策略文件里有待批', async () => {
    const dir = tempDir();
    const error = failureOf({ dir, output: 'Ignored build scripts: sharp\nRun "pnpm approve-builds"' });

    await expect(
      runInstallStep({ command: `pnpm add --dir '${dir}' 'opencli-plugin-demo@1.0.0'` }, undefined, [], {
        run: async () => {
          throw error;
        },
        runAll: async () => undefined,
      }),
    ).rejects.toMatchObject({ code: 'build-blocked', pendingBuilds: ['sharp'] });

    expect(pendingBuildsOf(dir)).toEqual(['sharp']);
    expect(pendingBuildsOfError(error)).toBeUndefined();
  });

  it('不是构建脚本的失败：原样抛，不留待批', async () => {
    const dir = tempDir();
    const error = failureOf({ dir, output: 'EACCES: permission denied' });

    await expect(
      runInstallStep({ command: `pnpm add --dir '${dir}' 'x@1.0.0'` }, undefined, [], {
        run: async () => {
          throw error;
        },
        runAll: async () => undefined,
      }),
    ).rejects.toBe(error);

    expect(pendingBuildsOf(dir)).toEqual([]);
  });

  it('带批准重跑时，按 --dir 那本策略放行', async () => {
    const dir = tempDir();
    recordPendingBuilds(dir, 'Ignored build scripts: sharp');
    const ran: string[] = [];

    await runInstallStep(
      { command: `pnpm add --dir '${dir}' 'x@1.0.0'` },
      ['sharp'],
      [],
      {
        run: async (line) => {
          ran.push(line);
        },
        runAll: async () => undefined,
      },
    );

    expect(ran).toHaveLength(1);
    expect(pendingBuildsOf(dir)).toEqual([]);
  });
});
