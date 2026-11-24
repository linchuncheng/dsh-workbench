import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const PACKAGES = ['shared', 'adapter-runtime', 'adapter-supply', 'adapter-profile', 'adapter-probe', 'adapters-default', 'core'];

const ENVELOPE_OWNERS = new Set([
  'packages/adapter-runtime/src/cli/opencli-wire.ts',
  'packages/adapter-runtime/src/data/index.ts',
]);

const ERROR_TEXT_OWNERS = new Set([
  'packages/adapter-runtime/src/cli/opencli.ts',
  'packages/shared/src/host/runtime/cli-error.ts',
]);

const ENVELOPE_OK = /\['ok'\]|\{\s*ok\s*,\s*data\s*\}/;
const ENVELOPE_DATA = /\['data'\]|\{\s*ok\s*,\s*data\s*\}/;
const ERROR_TEXT = /parseCliErrorEnvelope\s*\(/;
const RAW_STDOUT = /JSON\.parse\(\s*[A-Za-z0-9_.]*\.stdout/;

const ADAPTER_PACKAGES = new Set(['adapter-runtime', 'adapter-supply', 'adapter-profile', 'adapter-probe', 'adapters-default']);

const RUNTIME_FLAG = /['"`]--(?:session|window)\b/;

const BROWSER_LINE = /backgroundLine\s*\(/;
const BROWSER_ARGV = /['"]browser['"]/;
const DIALECT = /\bdialect\b/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

const findings = [];

function report(rel, lines, pattern, why, fix) {
  const at = lines.findIndex((line) => pattern.test(line));
  if (at === -1) return;
  findings.push({ rel, at: at + 1, text: lines[at]?.trim() ?? '', why, fix });
}

for (const pkg of PACKAGES) {
  for (const file of walk(join(ROOT, 'packages', pkg, 'src'))) {
    const rel = file.slice(ROOT.length + 1).split('\\').join('/');
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const hasOk = lines.some((line) => ENVELOPE_OK.test(line));
    const hasData = lines.some((line) => ENVELOPE_DATA.test(line));

    if (hasOk && hasData && !ENVELOPE_OWNERS.has(rel)) {
      report(
        rel,
        lines,
        ENVELOPE_OK,
        '这里又在自己认 opencli 的 ok / data 信封',
        'core 走 surface 的 commandResult / browserCapture；适配器层走 opencliResultOf / opencliBrowserCaptureOf。信封只有 adapter-runtime/src/cli/opencli-wire.ts 认。',
      );
      continue;
    }

    if (pkg === 'shared') {
      report(
        rel,
        lines,
        RUNTIME_FLAG,
        '共享层里出现了运行时的命令行旗标',
        '方言归适配器的命令面（RuntimeCommandSurface.background）；shared 只给原始 argv。',
      );
    }

    if (ADAPTER_PACKAGES.has(pkg) && BROWSER_LINE.test(text) && BROWSER_ARGV.test(text) && !DIALECT.test(text)) {
      report(
        rel,
        lines,
        BROWSER_LINE,
        '这里拼浏览器命令，但没有指定方言',
        '方言按当前装的版本算（sessionDialectOf(installedOpencliVersion())）；用默认 flag 会让 1.x 直接报 unknown command。',
      );
    }

    if (ADAPTER_PACKAGES.has(pkg)) {
      report(
        rel,
        lines,
        RAW_STDOUT,
        '适配器层里直接 JSON.parse 命令的 stdout',
        '先过 opencliResultOf / opencliBrowserCaptureOf；这是唯一认 opencli 输出格式的地方。',
      );
    }

    if (!ERROR_TEXT_OWNERS.has(rel)) {
      report(
        rel,
        lines,
        ERROR_TEXT,
        '这里又在自己读 opencli 的错误文本块',
        '先用 opencliErrorOf（2.x 的 JSON 错误），只有它给不出时调用方才回落到 parseCliErrorEnvelope。',
      );
    }
  }
}

if (findings.length > 0) {
  for (const one of findings) {
    console.error(`✖ ${one.rel}:${String(one.at)} —— ${one.why}`);
    if (one.text !== '') console.error(`    ${one.text.slice(0, 100)}`);
    console.error(`    → ${one.fix}`);
  }
  console.error(`✖ opencli 输出：${findings.length} 处绕过统一读法`);
  process.exit(1);
}

console.log(
  `✔ opencli 输出：信封与错误块只在适配器层认，浏览器命令都带方言（扫了 ${PACKAGES.length} 个包的 src）`,
);
