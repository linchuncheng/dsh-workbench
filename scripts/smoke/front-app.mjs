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

function launch(file, args) {
  execa(file, args, { detached: true, stdio: 'ignore', reject: false }).nodeChildProcess?.unref?.();
}

async function run(command) {
  const result = await seam
    .run({ command, intent: host.productWrite(), timeoutMs: 30_000, bestEffort: true })
    .catch((error) => ({ exitCode: 1, stdout: '', stderr: String(error) }));
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const [launcher, launcherArgs] = LAUNCH[OS];
launch(launcher, launcherArgs);

let front;
let app;
let raw = '';
for (let attempt = 0; attempt < 15; attempt += 1) {
  await sleep(1000);
  front = await run(host.frontAppCommand(OS));
  raw = `${front.stdout}${front.stderr}`;
  app = host.frontAppOf(front.stdout, OS);
  if (app !== undefined) break;
}

check(
  '前台应用读得出来',
  app !== undefined && app !== '',
  `命令退出码 ${String(front?.exitCode)} · 读到 ${String(app)} · 原文 ${JSON.stringify(raw.trim().slice(0, 200))}`,
);

const matched = EXPECT instanceof RegExp ? EXPECT.test(String(app)) : app === EXPECT;
check('读到的是刚打开的那个应用', matched, `期望 ${String(EXPECT)}，实际 ${String(app)}`);

const backCommand = host.bringBackCommand(String(app ?? ''), OS);
check('带回前台跑得通', backCommand !== undefined && (await run(backCommand)).exitCode === 0, `命令 ${String(backCommand)}`);

const missing = await run(host.bringBackCommand('dsh-no-such-app-at-all', OS));
check('找不到的应用不假装成功', missing.exitCode !== 0, `退出码 ${String(missing.exitCode)}`);

finish();
