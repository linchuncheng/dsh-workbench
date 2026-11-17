import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execaSync } from 'execa';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['packages', 'scripts'];
const REPORT_NAME = 'jscpd-report.json';
const LIST_LIMIT = 20;

function jscpd(extra) {
  return execaSync('jscpd', [...TARGETS, ...extra], {
    cwd: ROOT,
    preferLocal: true,
    reject: false,
    encoding: 'utf8',
  });
}

function echo(result) {
  if (result.stdout) process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
}

function shown(file) {
  return relative(ROOT, file);
}

function cloneLine(clone) {
  const first = clone.firstFile;
  const second = clone.secondFile;
  return `  · ${shown(first.name)}:${first.start}-${first.end} ~ ${shown(second.name)}:${second.start}-${second.end}（${clone.lines} 行 / ${clone.tokens} tokens）`;
}

function readReport(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

const declarationCache = new Map();

function declarationOnly(file, start, end) {
  const key = `${file}:${start ?? 0}-${end ?? 0}`;
  const cached = declarationCache.get(key);
  if (cached !== undefined) return cached;
  let verdict;
  try {
    const all = readFileSync(file, 'utf8').split('\n');
    const lines = start === undefined ? all : all.slice(start - 1, end);
    const meaningful = lines
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'));
    verdict =
      meaningful.length > 0 &&
      meaningful.every(
        (line) =>
          /^(export|import)\b/.test(line) ||
          /^[\w$]+,?$/.test(line) ||
          /^}\s*from\s+['"]/.test(line),
      );
  } catch {
    verdict = false;
  }
  declarationCache.set(key, verdict);
  return verdict;
}

function withoutStructuralClones(clones) {
  const only = (file, start, end) => declarationOnly(file, start, end);
  return clones.filter((clone) => {
    const first = clone.firstFile;
    const second = clone.secondFile;
    const barrels = only(first.name) && only(second.name);
    const imports = only(first.name, first.start, first.end) && only(second.name, second.start, second.end);
    return !barrels && !imports;
  });
}

function check() {
  const output = mkdtempSync(join(tmpdir(), 'dsh-jscpd-'));
  let result;
  try {
    result = jscpd(['--reporters', 'json', '--output', output, '--absolute']);
    const report = readReport(join(output, REPORT_NAME));
    if (report === undefined) {
      echo(result);
      console.error('✖ 重复代码：jscpd 没跑成 —— 没装依赖就 pnpm install，没有基线就 pnpm run duplication:accept');
      return 2;
    }
    const total = report.statistics.total;
    const clones = withoutStructuralClones(report.duplicates ?? []);
    const fresh = clones.filter((one) => one.isNew === true);
    const percent = total.percentage.toFixed(2);
    if (fresh.length === 0) {
      console.log(`✔ 重复代码：${total.clones} 块 / ${total.duplicatedLines} 行（${percent}%）；没有新增克隆`);
      return 0;
    }
    console.error(`✖ 重复代码：${fresh.length} 块不在基线里（共 ${total.clones} 块 / ${total.duplicatedLines} 行，${percent}%）`);
    for (const clone of fresh.slice(0, LIST_LIMIT)) console.error(cloneLine(clone));
    if (fresh.length > LIST_LIMIT) console.error(`  · 还有 ${fresh.length - LIST_LIMIT} 块，跑 pnpm run duplication:report 看全量`);
    console.error('  → 消掉重复；确认可以接受就跑 pnpm run duplication:accept，并把 .jscpd-baseline.json 一起提交');
    return 1;
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

function accept() {
  const result = jscpd(['--reporters', 'silent', '--update-baseline']);
  echo(result);
  if (result.exitCode === 0) console.log('✔ 基线已重写：.jscpd-baseline.json（和代码一起提交）');
  return result.exitCode ?? 1;
}

function report() {
  const output = join(ROOT, 'coverage', 'duplication');
  rmSync(output, { recursive: true, force: true });
  const result = jscpd(['--reporters', 'html,json', '--output', output, '--absolute']);
  echo(result);
  if (existsSync(join(output, 'jscpd-report.html'))) {
    console.log(`✔ 报告：${relative(ROOT, join(output, 'jscpd-report.html'))}`);
  }
  return result.exitCode ?? 1;
}

const mode = process.argv.includes('--accept') ? 'accept' : process.argv.includes('--report') ? 'report' : 'check';
const exitCode = mode === 'accept' ? accept() : mode === 'report' ? report() : check();
process.exit(exitCode);
