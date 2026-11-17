#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  acquireUpdateLease,
  activeHostLeases,
  clearReinstallRecord,
  cmdNameOf,
  readReinstallRecord,
  recoverUpdateJournal,
  reinstallRecordFile,
  shellKindOf,
  updateLeaseActive,
  writeReinstallRecord,
} from '@dsh-workbench/shared/host';

const HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const PROFILE = process.env.WORKBENCH_PROFILE?.trim() || 'workbench';
const ROOT = process.env.DSH_WORKBENCH_HOME?.trim() || join(HOME, PROFILE);
const FILE = join(ROOT, 'self-update-journal.json');
const RECORD = reinstallRecordFile(ROOT);
const MAX_REINSTALL_ATTEMPTS = 3;
const SHELL = shellKindOf();
const PNPM = cmdNameOf('pnpm');

function say(message) {
  process.stderr.write(`dsh-workbench: ${message}\n`);
}

function recoverJournal() {
  if (!existsSync(FILE)) return 'none';
  try {
    const recovered = recoverUpdateJournal({
      file: FILE,
      bootFile: join(ROOT, 'self-update-boot.json'),
      upFile: join(ROOT, 'self-update-up.json'),
      markerPath: join(ROOT, 'self-update.json'),
      log: (line) => process.stdout.write(`→ ${line}\n`),
    });
    if (recovered.kind === 'kept') say(`换版现场没能自动恢复：${recovered.detail}`);
    return recovered.kind;
  } catch (error) {
    say(`读换版日志时出错了：${error instanceof Error ? error.message : String(error)}`);
    return 'error';
  }
}

function pnpmCommand() {
  const local = join(ROOT, 'pnpm-10', 'node_modules', '.bin', PNPM);
  if (existsSync(local)) return local;
  return PNPM;
}

function reinstallPending() {
  const record = readReinstallRecord(RECORD);
  if (record === undefined) return;
  if (activeHostLeases(record.profileDir).length > 0) return;
  if (updateLeaseActive(ROOT)) return;
  const attempts = record.attempts ?? 0;
  if (attempts >= MAX_REINSTALL_ATTEMPTS) {
    say(`profile 重装连续失败 ${attempts} 次，先不再自动重试：${record.reason ?? '原因没记下来'}`);
    return;
  }
  let lease;
  try {
    lease = acquireUpdateLease({ root: ROOT, pid: process.pid, kind: 'reinstall' });
  } catch (error) {
    say(`重装锁没写上，这次先不重装：${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (lease === undefined) return;
  try {
    const result = spawnSync(
      pnpmCommand(),
      ['install', '--dir', record.profileDir, '--prefer-offline', '--config.confirm-modules-purge=false'],
      {
        stdio: 'inherit',
        env: process.env,
        shell: SHELL === 'pwsh',
        timeout: 10 * 60_000,
        killSignal: 'SIGTERM',
      },
    );
    if (result.status === 0) {
      clearReinstallRecord(RECORD);
      process.stdout.write('→ profile 已按新的 link 重装\n');
      return;
    }
    const reason = result.error?.message ?? `退出码 ${String(result.status)}`;
    say(`profile 重装没成：${reason}`);
    writeReinstallRecord(RECORD, {
      ...record,
      state: 'failed',
      reason,
      attempts: attempts + 1,
      at: new Date().toISOString(),
    });
  } catch (error) {
    say(`待重装记录没处理成：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    lease.release();
  }
}

const journal = recoverJournal();
if (journal === 'none' || journal === 'cleared' || journal === 'restored') {
  reinstallPending();
} else {
  say('换版现场还没处理干净，这次先不自动重装依赖。');
}
