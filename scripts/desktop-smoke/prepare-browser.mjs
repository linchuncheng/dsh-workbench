import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execa } from 'execa';

const temp = process.env.RUNNER_TEMP ?? tmpdir();
const platform = process.platform === 'win32' ? 'win64' : process.platform === 'darwin' ? 'mac-arm64' : 'linux64';
const label = process.env.DESKTOP_SMOKE_OS ?? '';
const logFile = label === '' ? undefined : `desktop-${label}-prep.log`;
if (logFile !== undefined) writeFileSync(logFile, '');
const log = (line) => {
  process.stdout.write(`${line}\n`);
  if (logFile !== undefined) appendFileSync(logFile, `${line}\n`);
};

const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 180_000;

async function download(url, file) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

async function withRetries(what, run) {
  let last;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await run();
      return;
    } catch (error) {
      last = error;
      if (attempt < DOWNLOAD_ATTEMPTS) {
        log(`${what}（第 ${String(attempt)} 次）失败：${error instanceof Error ? error.message : String(error)}，重试`);
        await new Promise((resolve) => {
          setTimeout(resolve, attempt * 3000);
        });
      }
    }
  }
  throw last;
}

function treeOf(dir, depth = 2) {
  if (!existsSync(dir)) return `（${dir} 不存在）`;
  const lines = [];
  const walk = (base, level) => {
    if (level > depth) return;
    for (const one of readdirSync(base, { withFileTypes: true }).slice(0, 20)) {
      lines.push(`${'  '.repeat(level - 1)}${one.name}${one.isDirectory() ? '/' : ''}`);
      if (one.isDirectory()) walk(join(base, one.name), level + 1);
    }
  };
  walk(dir, 1);
  return lines.join('\n');
}

async function unzip(zip, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  if (process.platform === 'win32') {
    await execa('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -Path '${zip}' -DestinationPath '${dest}' -Force`,
    ]);
    return;
  }
  await execa('unzip', ['-q', zip, '-d', dest]);
}

function writeEnv(entries) {
  const file = process.env.GITHUB_ENV;
  if (file === undefined || file === '') throw new Error('GITHUB_ENV 不在：这个脚本只在 CI 里跑');
  appendFileSync(file, `${entries.map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}

const meta = await fetch('https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json').then(
  (response) => response.json(),
);
const cft = meta.channels.Stable.downloads.chrome.find((one) => one.platform === platform);
if (cft === undefined) throw new Error(`Chrome for Testing 没有 ${platform} 包`);
log(`cft: ${cft.url}`);
const chrome =
  process.platform === 'win32'
    ? join(temp, 'cft', 'chrome-win64', 'chrome.exe')
    : join(temp, 'cft', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
await withRetries('准备 Chrome', async () => {
  await download(cft.url, join(temp, 'cft.zip'));
  await unzip(join(temp, 'cft.zip'), join(temp, 'cft'));
  if (!existsSync(chrome)) {
    throw new Error(`Chrome for Testing 没解出来：${chrome}\n解出来的目录：\n${treeOf(join(temp, 'cft'))}`);
  }
});
if (process.platform === 'win32') {
  const version = await execa('powershell', [
    '-NoProfile',
    '-Command',
    `(Get-Item '${chrome}').VersionInfo.FileVersion`,
  ]);
  log(`chrome: ${version.stdout.trim()}`);
} else {
  const version = await execa(chrome, ['--version']);
  log(`chrome: ${version.stdout.trim()}`);
}

const constants = readFileSync('packages/shared/src/config/constants.ts', 'utf8');
const pin = /OPENCLI_PIN\s*=\s*"([^"]+)"/u.exec(constants)?.[1];
if (pin === undefined) throw new Error('OPENCLI_PIN 读不到');
log(`opencli pin: ${pin}`);

const latest = await fetch('https://github.com/jackwener/opencli/releases/latest', { redirect: 'follow' });
const tag = latest.url.split('/').pop();
if (tag === undefined || tag === '') throw new Error(`latest release 解析失败：${latest.url}`);
log(`latest release: ${tag}`);
const assets = await fetch(`https://github.com/jackwener/opencli/releases/expanded_assets/${tag}`).then((response) => response.text());
const asset = /opencli-extension-v[0-9.]+\.zip/u.exec(assets)?.[0];
if (asset === undefined) throw new Error(`latest release 里没有扩展包：${assets.slice(0, 200)}`);
const extensionUrl = `https://github.com/jackwener/opencli/releases/download/${tag}/${asset}`;
log(`extension: ${extensionUrl}`);
await withRetries('下载扩展', async () => {
  await download(extensionUrl, join(temp, 'opencli-ext.zip'));
  await unzip(join(temp, 'opencli-ext.zip'), join(temp, 'opencli-ext'));
});
let extensionDir = join(temp, 'opencli-ext');
if (!existsSync(join(extensionDir, 'manifest.json'))) {
  const nested = await execa('node', [
    '-e',
    `const {readdirSync}=require('node:fs');const base=process.argv[1];const walk=(dir)=>{for(const one of readdirSync(dir,{withFileTypes:true})){const next=require('node:path').join(dir,one.name);if(one.isDirectory()){const found=walk(next);if(found)return found;}else if(one.name==='manifest.json')return dir;}};console.log(walk(base))`,
    extensionDir,
  ]);
  extensionDir = nested.stdout.trim();
}
if (!existsSync(join(extensionDir, 'manifest.json'))) throw new Error(`扩展包里没有 manifest.json：${extensionDir}`);
const extension = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
log(`extension version: ${String(extension.version)} · dir: ${extensionDir}`);

const home = homedir();
const opencliBin =
  process.platform === 'win32'
    ? join(home, '.dsh', 'workbench', 'opencli', 'bin', 'opencli.cmd')
    : join(home, '.dsh', 'workbench', 'opencli', 'bin', 'opencli');
const nodeBin = join(
  process.env.LOCALAPPDATA ?? home,
  'Programs',
  'DeepSeek Harness',
  'resources',
  'runtime',
  'primary-runtime',
  'dependencies',
  'node',
  'bin',
);
const entries = [
  ['DESKTOP_SMOKE_CHROME', chrome],
  ['DESKTOP_SMOKE_EXTENSION', extensionDir],
  ['DESKTOP_SMOKE_OPENCLI', opencliBin],
  ...(process.platform === 'win32' && existsSync(nodeBin) ? [['DESKTOP_SMOKE_NODE_BIN', nodeBin]] : []),
];
writeEnv(entries);
log(`env: ${entries.map(([key, value]) => `${key}=${value}`).join(' · ')}`);
