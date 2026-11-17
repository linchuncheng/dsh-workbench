import { execa } from 'execa';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createRealShell, createReporter, loadHost } from './harness.mjs';

const host = await loadHost();
const { check, finish } = createReporter();
const OS = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
const WORK = mkdtempSync(join(tmpdir(), 'dsh-front-app-'));
const seam = host.createSeam({
  shell: createRealShell(host),
  runtimeRoot: join(WORK, 'runtime'),
  ceiling: 'workspace-write',
});

const EXPECT = { darwin: 'com.apple.TextEdit', linux: /^\d+$/, win32: /^\d+$/ }[OS];
const LAUNCH = {
  darwin: ['open', ['-a', 'TextEdit']],
  linux: ['xterm', ['-T', 'xterm']],
  win32: ['cmd', ['/d', '/s', '/c', 'start', '""', 'notepad']],
};

async function run(command) {
  const result = await seam
    .run({ command, intent: host.productWrite(), timeoutMs: 30_000, bestEffort: true })
    .catch((error) => ({ exitCode: 1, stdout: '', stderr: String(error) }));
  return result;
}

const [launcher, launcherArgs] = LAUNCH[OS];
await execa(launcher, launcherArgs, { reject: false, timeout: 20_000 });
await new Promise((resolve) => {
  setTimeout(resolve, 3000);
});

const front = await run(host.frontAppCommand(OS));
const app = host.frontAppOf(front.stdout, OS);
check('前台应用读得出来', app !== undefined && app !== '', `命令退出码 ${String(front.exitCode)} · 读到 ${String(app)}`);
const matched = EXPECT instanceof RegExp ? EXPECT.test(String(app)) : app === EXPECT;
check('读到的是刚打开的那个应用', matched, `期望 ${String(EXPECT)}，实际 ${String(app)}`);

const back = await run(host.bringBackCommand(String(app ?? ''), OS));
check('带回前台跑得通', back.exitCode === 0, `退出码 ${String(back.exitCode)}${back.stderr === '' ? '' : ` · ${back.stderr.trim().slice(0, 200)}`}`);

const missing = await run(host.bringBackCommand('dsh-no-such-app-at-all', OS));
check('找不到的应用不假装成功', missing.exitCode !== 0, `退出码 ${String(missing.exitCode)}`);

finish();
