import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonFile } from '@dsh-workbench/shared/host';
import { workbenchRootOf } from '../release/release-util.mjs';

export const OUTBOX_DIR = 'outbox';

export function outboxDirOf(home) {
  return join(workbenchRootOf(home), 'diy', OUTBOX_DIR);
}

function fileKeyOf(unit) {
  return unit.replace(/[^\w.-]/g, '_');
}

export function pushBuild({ unit, root, files = [], home, now = new Date() }) {
  const workbench = workbenchRootOf(home);
  if (!existsSync(join(workbench, 'diy'))) {
    return { ok: false, skipped: true, reason: '没有工坊目录（工作台可能没有安装）' };
  }
  const target = join(workbench, 'diy', OUTBOX_DIR, `${fileKeyOf(unit)}.json`);
  try {
    writeJsonFile(target, { unit, dir: root, at: now.toISOString(), files, pid: process.pid });
    return { ok: true, target };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}
