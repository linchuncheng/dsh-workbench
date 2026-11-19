import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  acquireHostLease,
  acquireUpdateLease,
  reinstallRecordFile,
  updateJournalFile,
  writeJsonFile,
  writeReinstallRecord,
  writeUpdateJournal,
  type UpdateJournalRecord,
} from '@dsh-workbench/shared/host';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-recover-script-'));
const SCRIPT = fileURLToPath(new URL('../../../../../scripts/recover-update.mjs', import.meta.url));
const FROM = '1.2.3-beta.2';
const TO = '1.2.3-beta.3';
const PKG = '@dsh-workbench/core';

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

interface Case {
  readonly home: string;
  readonly root: string;
  readonly profileDir: string;
  readonly markerPath: string;
  readonly journalPath: string;
}

function caseDirs(): Case {
  const home = mkdtempSync(join(ROOT, 'home-'));
  const profileDir = join(home, 'profiles', 'workbench');
  const root = join(home, 'workbench');
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(root, { recursive: true });
  writeJsonFile(join(profileDir, 'package.json'), {
    name: 'dsh-profile-workbench',
    private: true,
    dsh: { profile: { bundles: [PKG] } },
    dependencies: { [PKG]: `link:../../workbench/versions/${TO}/node_modules/${PKG}` },
  });
  return {
    home,
    root,
    profileDir,
    markerPath: join(root, 'self-update.json'),
    journalPath: updateJournalFile(root),
  };
}

function versionDir(root: string, version: string): string {
  const dir = join(root, 'versions', version, 'node_modules', PKG);
  mkdirSync(dir, { recursive: true });
  writeJsonFile(join(dir, 'package.json'), { name: PKG, version });
  return dir;
}

function journalOf(input: Case, fromTarget: string): UpdateJournalRecord {
  return {
    schema: 1,
    state: 'flipping',
    from: FROM,
    to: TO,
    profileDir: input.profileDir,
    versionsDir: join(input.root, 'versions'),
    versionDir: join(input.root, 'versions', TO),
    manifestPath: join(input.profileDir, 'package.json'),
    manifestText: readFileSync(join(input.profileDir, 'package.json'), 'utf8'),
    links: [{ pkg: PKG, path: join(input.profileDir, 'node_modules', PKG), kind: 'symlink', target: fromTarget }],
    carry: [],
    cursor: 0,
    carried: 0,
    at: '2026-11-14T10:00:00.000Z',
  };
}

function runScript(input: Case, extraEnv: Readonly<Record<string, string>> = {}): void {
  const result = spawnSync(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      DSH_HOME: input.home,
      WORKBENCH_PROFILE: 'workbench',
      DSH_WORKBENCH_HOME: input.root,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
}

describe('启动器脚本：exec dsh 之前按换版日志收尾', () => {
  it('★ 已提交：只清日志，链接保持新版', () => {
    const input = caseDirs();
    const next = versionDir(input.root, TO);
    mkdirSync(dirname(join(input.profileDir, 'node_modules', PKG)), { recursive: true });
    symlinkSync(next, join(input.profileDir, 'node_modules', PKG));
    writeUpdateJournal(input.journalPath, { ...journalOf(input, next), state: 'committed' });

    runScript(input);

    expect(readlinkSync(join(input.profileDir, 'node_modules', PKG))).toBe(next);
    expect(() => readFileSync(input.journalPath)).toThrow();
  });

  it('★ 没提交、目标没启动：按快照恢复并标记失败', () => {
    const input = caseDirs();
    const old = versionDir(input.root, FROM);
    const next = versionDir(input.root, TO);
    const record = journalOf(input, old);
    writeUpdateJournal(input.journalPath, record);
    mkdirSync(dirname(join(input.profileDir, 'node_modules', PKG)), { recursive: true });
    symlinkSync(next, join(input.profileDir, 'node_modules', PKG));

    runScript(input);

    expect(readlinkSync(join(input.profileDir, 'node_modules', PKG))).toBe(old);
    expect(readFileSync(join(input.profileDir, 'package.json'), 'utf8')).toBe(record.manifestText);
    expect(() => readFileSync(input.journalPath)).toThrow();
    expect(JSON.parse(readFileSync(input.markerPath, 'utf8'))).toMatchObject({ state: 'failed', version: FROM });
  });

  it('★ 没提交但旧目录已经不在了：保留现场，不猜', () => {
    const input = caseDirs();
    const old = join(input.root, 'versions', FROM, 'node_modules', PKG);
    const next = versionDir(input.root, TO);
    writeUpdateJournal(input.journalPath, journalOf(input, old));
    mkdirSync(dirname(join(input.profileDir, 'node_modules', PKG)), { recursive: true });
    symlinkSync(next, join(input.profileDir, 'node_modules', PKG));

    runScript(input);

    expect(readlinkSync(join(input.profileDir, 'node_modules', PKG))).toBe(next);
    expect(readFileSync(input.journalPath, 'utf8')).toContain('flipping');
    expect(JSON.parse(readFileSync(input.markerPath, 'utf8')).state).toBe('failed');
  });

  it('★ 日志损坏：不拦启动，原样留着', () => {
    const input = caseDirs();
    writeFileSync(input.journalPath, 'not json', 'utf8');

    runScript(input);

    expect(readFileSync(input.journalPath, 'utf8')).toBe('not json');
  });
});

describe('启动器脚本：exec dsh 之前消费待重装记录', () => {
  function pnpmStub(): { readonly dir: string; readonly stamp: string } {
    const dir = mkdtempSync(join(ROOT, 'bin-'));
    const stamp = join(dir, 'ran.txt');
    if (process.platform === 'win32') {
      writeFileSync(join(dir, 'pnpm.cmd'), `@echo %* > "${stamp}"\r\n@exit /b 0\r\n`);
    } else {
      writeFileSync(join(dir, 'pnpm'), `#!/bin/sh\necho "$@" > "${stamp}"\nexit 0\n`, { mode: 0o755 });
    }
    return { dir, stamp };
  }

  it('★ 没有活窗口：跑一次 profile 重装，成功了把记录清掉', () => {
    const input = caseDirs();
    const recordFile = reinstallRecordFile(input.root);
    writeReinstallRecord(recordFile, {
      schema: 1,
      state: 'pending',
      profile: 'workbench',
      profileDir: input.profileDir,
      version: TO,
      at: '2026-11-14T10:00:00.000Z',
    });
    const stub = pnpmStub();

    runScript(input, { PATH: `${stub.dir}${delimiter}${process.env['PATH'] ?? ''}` });

    expect(existsSync(stub.stamp)).toBe(true);
    expect(readFileSync(stub.stamp, 'utf8')).toContain(`--dir ${input.profileDir}`);
    expect(existsSync(recordFile)).toBe(false);
  });

  it('★ 还有窗口活着：不重装，记录原样留着', () => {
    const input = caseDirs();
    const recordFile = reinstallRecordFile(input.root);
    writeReinstallRecord(recordFile, {
      schema: 1,
      state: 'pending',
      profile: 'workbench',
      profileDir: input.profileDir,
      version: TO,
      at: '2026-11-14T10:00:00.000Z',
    });
    const stub = pnpmStub();
    const lease = acquireHostLease({ profileDir: input.profileDir, profile: 'workbench', pid: process.pid });
    try {
      runScript(input, { PATH: `${stub.dir}${delimiter}${process.env['PATH'] ?? ''}` });
      expect(existsSync(stub.stamp)).toBe(false);
      expect(existsSync(recordFile)).toBe(true);
    } finally {
      lease.release();
    }
  });

  it('★ 优先用运行时根里的本地 pnpm', () => {
    const input = caseDirs();
    const recordFile = reinstallRecordFile(input.root);
    writeReinstallRecord(recordFile, {
      schema: 1,
      state: 'pending',
      profile: 'workbench',
      profileDir: input.profileDir,
      version: TO,
      at: '2026-11-14T10:00:00.000Z',
    });
    const binDir = join(input.root, 'pnpm-10', 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const stamp = join(binDir, 'ran.txt');
    if (process.platform === 'win32') {
      writeFileSync(join(binDir, 'pnpm.cmd'), `@echo %* > "${stamp}"\r\n@exit /b 0\r\n`);
    } else {
      writeFileSync(join(binDir, 'pnpm'), `#!/bin/sh\necho "$@" > "${stamp}"\nexit 0\n`, { mode: 0o755 });
    }

    runScript(input);

    expect(existsSync(stamp)).toBe(true);
    expect(existsSync(recordFile)).toBe(false);
  });

  it('★ 更新执行器还活着：启动器不抢着重装', () => {
    const input = caseDirs();
    const recordFile = reinstallRecordFile(input.root);
    writeReinstallRecord(recordFile, {
      schema: 1,
      state: 'pending',
      profile: 'workbench',
      profileDir: input.profileDir,
      version: TO,
      at: '2026-11-14T10:00:00.000Z',
    });
    const stub = pnpmStub();
    const lease = acquireUpdateLease({ root: input.root });
    try {
      runScript(input, { PATH: `${stub.dir}${delimiter}${process.env['PATH'] ?? ''}` });
      expect(existsSync(stub.stamp)).toBe(false);
      expect(existsSync(recordFile)).toBe(true);
    } finally {
      lease?.release();
    }
  });
});
