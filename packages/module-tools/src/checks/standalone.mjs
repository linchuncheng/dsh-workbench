import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execaSync } from 'execa';
import { discoverPackages } from '../support/discover.mjs';
import { modulePackagesOf, skipReport } from '../support/scope.mjs';

const SHELL = '@dsh-workbench/core';

export const title = '独立构建';

export function signalsOf(platform) {
  return platform === 'win32' ? ['SIGINT'] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
}

export async function run(options = {}) {
  const shell = discoverPackages({ root: process.cwd() }).find((pkg) => pkg.manifest.name === SHELL);
  const visible = shell === undefined ? undefined : join(shell.dir, 'src');

  if (visible === undefined || !existsSync(visible)) {
    return {
      status: 'skip',
      notes: [`当前目录没有 ${SHELL} 的源码（"不得用 @/ 指向工作台"那条判据仍然生效）`],
      problems: [],
    };
  }

  const modules = modulePackagesOf(options);
  if (modules.length === 0) return skipReport('没有模块包（没有声明 dsh.workbench 的包）—— 没有可独立构建的对象');

  const hidden = join(shell.dir, 'src.hidden');
  if (existsSync(hidden)) {
    return {
      status: 'fail',
      notes: [],
      problems: [`上次未恢复干净：${hidden} 仍然存在，请手动改回名称后重新运行。`],
    };
  }

  const restore = () => {
    if (existsSync(hidden) && !existsSync(visible)) renameSync(hidden, visible);
  };

  const signals = signalsOf(process.platform);
  const handlers = new Map();
  const stop = (signal) => {
    restore();
    for (const [name, handler] of handlers) process.removeListener(name, handler);
    process.kill(process.pid, signal);
  };
  for (const signal of signals) {
    const handler = () => stop(signal);
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  const problems = [];
  renameSync(visible, hidden);
  try {
    for (const pkg of modules) {
      const name = pkg.manifest.name;
      for (const script of ['build', 'typecheck']) {
        if (pkg.manifest.scripts?.[script] === undefined) continue;
        try {
          execaSync('pnpm', ['run', script], { cwd: pkg.dir, stdio: 'pipe' });
        } catch (error) {
          const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
          const first = output
            .split('\n')
            .filter((line) => /error|Cannot find|Could not resolve|ERR_/.test(line))
            .slice(0, 2)
            .map((line) => line.trim())
            .join(' | ');
          problems.push(`${name} ${script} 在工作台源码不在场时失败 —— ${first.slice(0, 220)}`);
        }
      }
    }
  } finally {
    restore();
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  }

  if (problems.length > 0) {
    return {
      status: 'fail',
      notes: ['（上述清单即"发布后会失效"的位置：模块只允许依赖已发布的接口）'],
      problems,
    };
  }
  return {
    status: 'pass',
    notes: [`${modules.length} 个模块包在工作台源码不在场时均可 build + typecheck`],
    problems: [],
  };
}
