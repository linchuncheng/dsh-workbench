import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  acquireHostLease,
  readReinstallRecord,
  reinstallRecordFile,
  writeReinstallRecord,
} from '@dsh-workbench/shared/host';
import { createFakeProcesses } from '@dsh-workbench/shared/testing';
import { reinstallProfileWhenIdle } from '../self-update-reinstall.js';
import type { SelfUpdateSteps } from '../self-update-steps.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-reinstall-'));
const FROM = '1.2.3-beta.2';
const TO = '1.2.3-beta.3';
const AT = '2026-11-14T10:00:00.000Z';

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function planOf(): SelfUpdateSteps {
  const home = mkdtempSync(join(ROOT, 'home-'));
  const profileDir = join(home, 'profiles', 'workbench');
  mkdirSync(profileDir, { recursive: true });
  const root = join(home, 'workbench');
  return {
    profileDir,
    versionsDir: join(root, 'versions'),
    versionDir: join(root, 'versions', TO),
    version: TO,
    bundle: '@dsh-workbench/core',
    packages: [],
    migration: false,
    rescue: '',
    markerPath: join(root, 'self-update.json'),
    logPath: join(root, 'self-update.log'),
    marker: {
      dshHome: home,
      profile: 'workbench',
      pkg: '@dsh-workbench/core',
      from: FROM,
      to: TO,
      pinned: true,
      state: 'pending-restart',
      version: TO,
      at: AT,
    },
    steps: [{ kind: 'install', file: 'pnpm', args: ['install'], env: {}, cwd: home }],
  };
}

describe('重装延后：宿主退出后才在 profile 上跑 install', () => {
  it('★ 没有活窗口：直接在 profile 上重装，并清掉旧记录', async () => {
    const plan = planOf();
    const file = reinstallRecordFile(dirname(plan.markerPath));
    writeReinstallRecord(file, {
      schema: 1,
      state: 'pending',
      profile: 'workbench',
      profileDir: plan.profileDir,
      version: TO,
      at: AT,
    });
    const processes = createFakeProcesses([{ exitCode: 0, stdout: '+ 工作台' }]);

    const outcome = await reinstallProfileWhenIdle(plan, {
      processes: processes.host,
      now: () => AT,
      sleep: async () => {},
      pollMs: 0,
    });

    expect(outcome).toBe('done');
    expect(processes.calls).toHaveLength(1);
    expect(processes.calls[0]?.args).toEqual(
      expect.arrayContaining(['install', '--dir', plan.profileDir, '--prefer-offline']),
    );
    expect(readReinstallRecord(file)).toBeUndefined();
  });

  it('★ 还有窗口活着、等到上限：留下待重装记录，不在活宿主上动 node_modules', async () => {
    const plan = planOf();
    const file = reinstallRecordFile(dirname(plan.markerPath));
    const lease = acquireHostLease({ profileDir: plan.profileDir, profile: 'workbench', pid: process.pid });
    try {
      const processes = createFakeProcesses([{ exitCode: 0 }]);
      const outcome = await reinstallProfileWhenIdle(plan, { processes: processes.host, now: () => AT, waitMs: 0 });
      expect(outcome).toBe('pending');
      expect(processes.calls).toHaveLength(0);
      expect(readReinstallRecord(file)).toMatchObject({ state: 'pending', profileDir: plan.profileDir, version: TO });
    } finally {
      lease.release();
    }
  });

  it('★ 窗口刚退、启动窗口还没起稳：连续几次看不到活宿主才动手', async () => {
    const plan = planOf();
    const lease = acquireHostLease({ profileDir: plan.profileDir, profile: 'workbench', pid: process.pid });
    const processes = createFakeProcesses([{ exitCode: 0 }]);
    let polls = 0;
    const sleep = async (): Promise<void> => {
      polls += 1;
      if (polls === 1) lease.release();
    };
    try {
      const outcome = await reinstallProfileWhenIdle(plan, {
        processes: processes.host,
        now: () => AT,
        waitMs: 60_000,
        sleep,
        pollMs: 0,
      });
      expect(outcome).toBe('done');
      expect(polls).toBeGreaterThanOrEqual(3);
    } finally {
      lease.release();
    }
  });

  it('★ 宿主只是短暂消失又回来：空闲计数要归零，不能提前动手', async () => {
    const plan = planOf();
    const lease = acquireHostLease({ profileDir: plan.profileDir, profile: 'workbench', pid: process.pid });
    const processes = createFakeProcesses([{ exitCode: 0 }]);
    let polls = 0;
    let again: ReturnType<typeof acquireHostLease> | undefined;
    const sleep = async (): Promise<void> => {
      polls += 1;
      if (polls === 1) lease.release();
      if (polls === 2) again = acquireHostLease({ profileDir: plan.profileDir, profile: 'workbench', pid: process.pid, token: 'again' });
      if (polls === 3) again?.release();
    };
    try {
      const outcome = await reinstallProfileWhenIdle(plan, {
        processes: processes.host,
        now: () => AT,
        waitMs: 60_000,
        sleep,
        pollMs: 0,
      });
      expect(outcome).toBe('done');
      expect(polls).toBeGreaterThanOrEqual(5);
    } finally {
      again?.release();
      lease.release();
    }
  });

  it('★ 重装失败：留一条失败记录（累计次数），不碰已经换好的链接', async () => {
    const plan = planOf();
    const file = reinstallRecordFile(dirname(plan.markerPath));
    const linked = join(plan.profileDir, 'node_modules', '@dsh-workbench', 'core');
    mkdirSync(linked, { recursive: true });
    writeFileSync(join(linked, 'version.txt'), TO, 'utf8');
    writeReinstallRecord(file, {
      schema: 1,
      state: 'pending',
      profile: 'workbench',
      profileDir: plan.profileDir,
      version: TO,
      at: AT,
      attempts: 2,
    });
    const processes = createFakeProcesses([{ exitCode: 1, stderr: 'ERR_PNPM_FETCH_404' }]);

    const outcome = await reinstallProfileWhenIdle(plan, {
      processes: processes.host,
      now: () => AT,
      sleep: async () => {},
      pollMs: 0,
    });

    expect(outcome).toBe('failed');
    expect(readReinstallRecord(file)).toMatchObject({ state: 'failed', version: TO, attempts: 3 });
    expect(readReinstallRecord(file)?.reason).toContain('ERR_PNPM_FETCH_404');
    expect(existsSync(join(linked, 'version.txt'))).toBe(true);
  });
});
