#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

if (process.platform === 'win32') {
  console.error('dsh-workbench 的启动器是 bash 脚本；Windows 请用 Desktop，或在 dsh 里用 `dsh workbench`。');
  console.error('如果装了 Git Bash，也可以直接运行 bin\\dsh-workbench。');
  process.exit(1);
}

const result = spawnSync('bash', [join(here, 'dsh-workbench'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
