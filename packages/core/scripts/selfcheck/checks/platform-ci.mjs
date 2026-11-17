import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

import { REPO, read, walk } from '../lib.mjs';

const WORKFLOW_DIR = join(REPO, '.github', 'workflows');
const MANIFEST = join(REPO, 'packages', 'core', 'scripts', 'selfcheck', 'platform-ci.json');
const PACKAGES_DIR = join(REPO, 'packages');
const PLATFORM_TEST_RUNNER = 'scripts/ci/platform-tests.mjs';
const SMOKE_INDEX = 'scripts/smoke/index.mjs';
const OS = ['darwin', 'win32', 'linux'];
const OS_SET = new Set(OS);
const CODE_EXT = /\.(?:ts|tsx|mjs|cjs|js)$/;
const CANDIDATE = /process\.platform|\bhostOs\b|\bwin32\b|\bdarwin\b|\blinux\b|\bComSpec\b|\btaskkill\b/;
const SKIP_STEM = /(?:-mock|\.d)\.ts$/;

const TITLE =
  '★ 每个跨平台调用点都有 CI 腿跑到：清单、平台分支、测试与 workflow 对得上（新加平台分支要登记）';

function normal(path) {
  return path.split('\\').join('/');
}

function packageFiles(pkgDir) {
  try {
    return JSON.parse(read(join(pkgDir, 'package.json'))).files ?? [];
  } catch {
    return [];
  }
}

function shippedBy(pkgDir, rel) {
  return packageFiles(pkgDir).some((entry) => {
    const clean = String(entry).replace(/^\.\//u, '').replace(/\/+$/u, '');
    return rel === clean || rel.startsWith(`${clean}/`);
  });
}

function scanTargets() {
  const out = [];
  for (const name of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const pkgDir = join(PACKAGES_DIR, name.name);
    const add = (dir, shippedOnly) => {
      if (!existsSync(dir)) return;
      for (const file of walk(dir)) {
        if (!CODE_EXT.test(file)) continue;
        const pkgRel = normal(relative(pkgDir, file));
        if (SKIP_STEM.test(pkgRel)) continue;
        if (shippedOnly && !shippedBy(pkgDir, pkgRel)) continue;
        out.push(file);
      }
    };
    add(join(pkgDir, 'src'), false);
    add(join(pkgDir, 'scripts'), true);
    add(join(pkgDir, 'bin'), true);
  }
  return out;
}

function inTypePosition(node) {
  if (node === undefined) return false;
  return (
    ts.isTypeNode(node) ||
    ts.isImportDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isPropertyDeclaration(node)
  );
}

function scanSource(text, name = 'probe.ts') {
  if (!CANDIDATE.test(text)) return undefined;
  const source = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = new Set();
  let sensitive = false;
  let passThrough = false;
  const mark = (os) => {
    sensitive = true;
    for (const one of os) found.add(one);
  };
  const visit = (node, parent) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'platform' &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process'
    ) {
      sensitive = true;
      passThrough = true;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === 'ComSpec' &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'env'
    ) {
      mark(['win32']);
    }
    if (
      ts.isIdentifier(node) &&
      (node.text === 'hostOs' || node.text === 'win32' || node.text === 'ComSpec' || node.text === 'taskkill') &&
      !inTypePosition(parent) &&
      !(ts.isPropertyAccessExpression(parent) && parent.name === node)
    ) {
      mark(node.text === 'hostOs' ? OS : ['win32']);
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !inTypePosition(parent)) {
      if (OS_SET.has(node.text)) mark([node.text]);
      if (node.text === 'taskkill' || node.text === 'taskkill.exe' || node.text === 'ComSpec') mark(['win32']);
    }
    ts.forEachChild(node, (child) => visit(child, node));
  };
  visit(source, undefined);
  if (!sensitive) return undefined;
  if (found.size === 0 && passThrough) for (const one of OS) found.add(one);
  return OS.filter((one) => found.has(one));
}

function platformSites() {
  const out = new Map();
  for (const file of scanTargets()) {
    const rel = normal(relative(REPO, file));
    if (/\/(?:__tests__|contract|fixtures?)\//u.test(rel)) continue;
    const os = scanSource(read(file), file);
    if (os !== undefined) out.set(rel, os);
  }
  return out;
}

function runnerOsOf(image) {
  const clean = image.replace(/^['"]|['"]$/gu, '');
  if (/^ubuntu/iu.test(clean)) return 'linux';
  if (/^macos/iu.test(clean)) return 'darwin';
  if (/^windows/iu.test(clean)) return 'win32';
  return undefined;
}

function jobsOf(text) {
  const lines = text.split(/\r?\n/u);
  const jobs = [];
  const indentOf = (line) => (line.match(/^\s*/u)?.[0].length ?? 0);
  let current;
  let inJobs = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^jobs:\s*$/u.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    if (line.trim() !== '' && indentOf(line) === 0) break;
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/u.exec(line);
    if (header !== null) {
      current = { id: header[1], images: new Set(), commands: [] };
      jobs.push(current);
      continue;
    }
    if (current === undefined) continue;
    const run = /^\s+(?:-\s+)?run:\s*(.*)$/u.exec(line);
    if (run !== null) {
      const body = run[1].trim();
      if (body === '|' || body === '>' || body === '|-' || body === '>-') {
        const base = indentOf(line);
        const block = [];
        let next = index + 1;
        while (next < lines.length && (lines[next].trim() === '' || indentOf(lines[next]) > base)) {
          block.push(lines[next]);
          next += 1;
        }
        current.commands.push(block.join('\n'));
        index = next - 1;
      } else if (body !== '') {
        current.commands.push(body);
      }
      continue;
    }
    const matrixOs = /^\s*-\s*os:\s*([^\s#]+)/u.exec(line);
    if (matrixOs !== null) {
      const mapped = runnerOsOf(matrixOs[1]);
      if (mapped !== undefined) current.images.add(mapped);
      continue;
    }
    const runsOn = /^\s+runs-on:\s*([^\s#]+)/u.exec(line);
    if (runsOn !== null && !runsOn[1].startsWith('${{')) {
      const mapped = runnerOsOf(runsOn[1]);
      if (mapped !== undefined) current.images.add(mapped);
    }
  }
  return jobs;
}

function workflows() {
  const out = [];
  for (const name of readdirSync(WORKFLOW_DIR).sort()) {
    if (!/\.ya?ml$/u.test(name)) continue;
    out.push({ name, jobs: jobsOf(read(join(WORKFLOW_DIR, name))) });
  }
  return out;
}

function fullSuiteOf(command, pkgName) {
  if (/\bpnpm\s+(?:-w|--workspace-root)\s+run\s+(?:check|coverage)\b/u.test(command)) return true;
  if (new RegExp(`pnpm\\s+--filter\\s+${pkgName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s+run\\s+(?:test|coverage)\\b`, 'u').test(command)) {
    return true;
  }
  return /\bvitest\s+run\b/u.test(command) && !/(?:src|scripts)\/[^\s]*\.test\.[cm]?[jt]sx?/u.test(command);
}

function jobCovers(job, testRel, pkgName) {
  const pkgRel = testRel.replace(/^packages\/[^/]+\//u, '');
  for (const command of job.commands) {
    if (command.includes(testRel) || command.includes(pkgRel)) return true;
    if (command.includes(PLATFORM_TEST_RUNNER)) return true;
    if (fullSuiteOf(command, pkgName)) return true;
  }
  return false;
}

function packageNameOf(testRel) {
  const dir = testRel.split('/')[1];
  try {
    return JSON.parse(read(join(PACKAGES_DIR, dir, 'package.json'))).name;
  } catch {
    return dir;
  }
}

function coveringJobsOf(testRel, workflowsList) {
  const pkgName = packageNameOf(testRel);
  const out = [];
  for (const workflow of workflowsList) {
    for (const job of workflow.jobs) {
      if (jobCovers(job, testRel, pkgName)) out.push({ workflow: workflow.name, job: job.id, oses: job.images });
    }
  }
  return out;
}

function missingCoverage(testRel, os, workflowsList) {
  return !coveringJobsOf(testRel, workflowsList).some((one) => one.oses.has(os));
}

function smokeScriptFindings(workflowsList) {
  const findings = [];
  const workflow = workflowsList.find((one) => one.name === 'platform-smoke.yml');
  const job = workflow?.jobs.find((one) => one.id === 'smoke');
  if (job === undefined) {
    return ['platform-smoke.yml 里没有 smoke job：平台冒烟不再被 CI 跑'];
  }
  const missingOs = OS.filter((one) => !job.images.has(one));
  if (missingOs.length > 0) findings.push(`platform-smoke 少了 ${missingOs.join('、')} 腿`);
  const commands = job.commands.join('\n');
  if (!commands.includes(SMOKE_INDEX)) {
    findings.push(`${SMOKE_INDEX} 没被 platform-smoke 跑到：目录里新加的冒烟脚本不会被执行`);
  }
  if (!existsSync(join(REPO, SMOKE_INDEX))) findings.push(`${SMOKE_INDEX} 不存在：冒烟脚本没有入口`);
  return findings;
}

function manifestFindings(sites, workflowsList) {
  const findings = [];
  let manifest;
  try {
    manifest = JSON.parse(read(MANIFEST));
  } catch (error) {
    return [`读不了清单 ${normal(relative(REPO, MANIFEST))}：${error instanceof Error ? error.message : String(error)}`];
  }
  const declared = manifest.sites ?? {};
  for (const [rel, os] of sites) {
    const entry = declared[rel];
    if (entry === undefined) {
      findings.push(`${rel} 是平台调用点，但清单里没有它`);
      continue;
    }
    const declaredOs = Array.isArray(entry.os) ? [...entry.os].sort() : [];
    const found = [...os].sort();
    if (declaredOs.join(',') !== found.join(',')) {
      findings.push(`${rel} 的平台分支变了：清单写 ${declaredOs.join('+') || '空'}，源码是 ${found.join('+')}`);
    }
    const tests = Array.isArray(entry.tests) ? entry.tests : [];
    if (tests.length === 0) {
      findings.push(`${rel} 没登记任何测试`);
      continue;
    }
    const present = [];
    for (const test of tests) {
      if (existsSync(join(REPO, test))) present.push(test);
      else findings.push(`${rel} 登记的测试不存在：${test}`);
    }
    for (const one of os) {
      if (!present.some((test) => !missingCoverage(test, one, workflowsList))) {
        findings.push(`${rel} 的 ${one} 分支没有任何测试在 ${one} 腿上跑（登记：${present.join('、') || '无'}）`);
      }
    }
  }
  for (const rel of Object.keys(declared)) {
    if (!sites.has(rel)) findings.push(`${rel} 在清单里，但已经不算平台调用点（或文件没了）`);
  }
  for (const [name, tests] of Object.entries(manifest.suites ?? {})) {
    if (!Array.isArray(tests) || tests.length === 0) {
      findings.push(`suites.${name} 是空的`);
      continue;
    }
    for (const test of tests) {
      if (!existsSync(join(REPO, test))) findings.push(`suites.${name} 登记的测试不存在：${test}`);
    }
  }
  const runnerJobs = [];
  for (const workflow of workflowsList) {
    for (const job of workflow.jobs) {
      if (job.commands.some((command) => command.includes(PLATFORM_TEST_RUNNER))) runnerJobs.push(job);
    }
  }
  if (runnerJobs.length === 0) {
    findings.push(`${PLATFORM_TEST_RUNNER} 没被任何 workflow 跑到：清单里的平台测试没有腿`);
  } else {
    for (const one of OS) {
      if (!runnerJobs.some((job) => job.images.has(one))) findings.push(`${PLATFORM_TEST_RUNNER} 少了 ${one} 腿`);
    }
  }
  return findings;
}

export const checks = [
  {
    title: TITLE,
    tags: ['win32'],
    run(_ctx, report) {
      const workflowsList = workflows();
      const sites = platformSites();
      const findings = [...manifestFindings(sites, workflowsList), ...smokeScriptFindings(workflowsList)];
      const negative =
        scanSource("export const fine = process.platform === 'win32' ? 1 : 2;")?.join(',') === 'win32' &&
        scanSource("export const fine = hostOs;")?.length === 3 &&
        scanSource("import { win32 } from 'node:path';\nexport const fine = win32.join('a', 'b');")?.join(',') ===
          'win32' &&
        scanSource('export const fine = 1;') === undefined &&
        scanSource("export type Fine = 'darwin' | 'win32';") === undefined;
      const job = jobsOf(
        [
          'jobs:',
          '  smoke:',
          '    strategy:',
          '      matrix:',
          '        include:',
          '          - os: windows-2022',
          '    steps:',
          '      - run: |',
          '          pnpm --filter @dsh-workbench/shared exec vitest run src/host/shell/__tests__/shell-text.test.ts',
        ].join('\n'),
      )[0];
      const workflowNegative =
        job.images.has('win32') &&
        jobCovers(job, 'packages/shared/src/host/shell/__tests__/shell-text.test.ts', '@dsh-workbench/shared') &&
        !jobCovers(job, 'packages/shared/src/host/seam/__tests__/process.test.ts', '@dsh-workbench/shared');
      const runnerJob = jobsOf(
        [
          'jobs:',
          '  smoke:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          `      - run: node ${PLATFORM_TEST_RUNNER}`,
        ].join('\n'),
      )[0];
      const runnerNegative =
        runnerJob !== undefined &&
        jobCovers(runnerJob, 'packages/shared/src/host/shell/__tests__/shell-text.test.ts', '@dsh-workbench/shared');
      const ok = findings.length === 0 && negative && workflowNegative && runnerNegative;
      report(
        TITLE,
        ok,
        ok
          ? `${sites.size} 个平台调用点都在清单里；平台测试由 ${PLATFORM_TEST_RUNNER} 按清单跑在 ${OS.join('/')} 腿上；冒烟脚本由 ${SMOKE_INDEX} 目录发现（判据负例也过）`
          : !negative || !workflowNegative || !runnerNegative
            ? '判据自己的负例没过：扫描或 workflow 解析不可信'
            : findings.join(' · '),
      );
    },
  },
];
