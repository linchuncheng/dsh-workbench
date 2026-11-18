import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createReporter, loadHost } from './harness.mjs';

const host = await loadHost();
const { check, finish } = createReporter();
const WORK = mkdtempSync(join(tmpdir(), 'dsh-paths-'));
const ROOT = join(WORK, '目录 空格');
const FILE = join(ROOT, '子 目录', '说明 文件.txt');

try {
  host.writeTextFile(FILE, '中文 and spaces\n');
  check('中文/空格路径可写可读', readFileSync(FILE, 'utf8') === '中文 and spaces\n');
  check('父目录建出来', statSync(join(ROOT, '子 目录')).isDirectory());

  const target = join(WORK, 'target dir');
  host.ensureDir(target);
  host.writeTextFile(join(target, 'a.txt'), 'a');
  const link = join(WORK, 'link dir');
  host.linkDir(target, link);
  check('目录链接可读', readFileSync(join(link, 'a.txt'), 'utf8') === 'a');
  check('目录链接是链接', lstatSync(link).isSymbolicLink());
  check('链接指向目标', realpathSync(link) === realpathSync(target));

  host.removePath(link);
  check('removePath 只删链接', !existsSync(link) && existsSync(join(target, 'a.txt')));
} finally {
  rmSync(WORK, { recursive: true, force: true });
}

finish();
