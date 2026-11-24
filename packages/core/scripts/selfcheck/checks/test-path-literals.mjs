import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { REPO, read, walk } from '../lib.mjs';

const TEST_FILE = /\.test\.[cm]?[jt]sx?$/u;
const EQUALITY = new Set(['toBe', 'toEqual', 'toStrictEqual']);
const TITLE =
  '★ 测试里期望的绝对路径要么是文件里现成的输入，要么用 join 拼（Windows 上分隔符不同）';
const ALLOWED = new Map([
  [
    'packages/adapter-probe/src/toolchain/__tests__/runtime-seed.test.ts',
    '这一组 POSIX 落点的断言在 describePosix 里，Windows 上整组跳过；字面量就是这些落点的契约',
  ],
  [
    'packages/shared/src/host/adapters/__tests__/supply-port.test.ts',
    '期望值来自 fakeAdapterSet 夹具的固定目录，不是这一层拼出来的',
  ],
  [
    'packages/shared/src/host/runtime/__tests__/env-policy.test.ts',
    'GIT_ASKPASS 的固定值 /usr/bin/false 是 posix 分支的常量，不是拼出来的路径',
  ],
]);

function isPathLiteral(text) {
  if (!text.startsWith('/') || text.startsWith('//')) return false;
  if (/\s/u.test(text)) return false;
  return text.split('/').filter((one) => one !== '').length >= 2;
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function pathLiteralProblems(text, name = 'probe.test.ts') {
  const source = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const strings = [];
  const collect = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      strings.push({ node, text: node.text });
    }
    ts.forEachChild(node, collect);
  };
  collect(source);
  const out = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      EQUALITY.has(node.expression.name.text) &&
      ts.isCallExpression(node.expression.expression) &&
      ts.isIdentifier(node.expression.expression.expression) &&
      node.expression.expression.expression.text === 'expect'
    ) {
      const arg = node.arguments[0];
      if (arg !== undefined && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) && isPathLiteral(arg.text)) {
        const hasSource = strings.some((one) => one.node !== arg && one.text.includes(arg.text));
        if (!hasSource) out.push({ line: lineOf(source, arg), literal: arg.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function testFiles() {
  const out = [];
  const packagesRoot = join(REPO, 'packages');
  for (const name of readdirSync(packagesRoot)) {
    for (const sub of ['src', 'scripts']) {
      for (const file of walk(join(packagesRoot, name, sub), { withTests: true })) {
        if (TEST_FILE.test(file)) out.push(file);
      }
    }
  }
  for (const file of walk(join(REPO, 'scripts'), { withTests: true })) {
    if (TEST_FILE.test(file)) out.push(file);
  }
  return out;
}

export const checks = [
  {
    title: TITLE,
    tags: ['win32'],
    run(_ctx, report) {
      const hits = [];
      let scanned = 0;
      for (const file of testFiles()) {
        const rel = file.slice(REPO.length + 1).replaceAll('\\', '/');
        if (ALLOWED.has(rel)) continue;
        scanned += 1;
        for (const problem of pathLiteralProblems(read(file), rel)) {
          hits.push(`${rel}:${problem.line} 期望值 ${problem.literal} 在文件里没有现成来源：用 join(...) 拼`);
        }
      }
      const flagged = pathLiteralProblems("expect(evidence?.evidence).toBe('/tmp/wb/preflight.json');");
      const echoed = pathLiteralProblems("const file = '/tmp/wb/preflight.json';\nexpect(read(file)).toBe('/tmp/wb/preflight.json');");
      const joined = pathLiteralProblems("expect(evidence?.evidence).toBe(join('/tmp/wb', 'preflight.json'));");
      const quiet = [
        "expect(one).toBe(join('/tmp/wb', 'a.json'));",
        "expect(url).toBe('//cdn.example.com/a');",
        "expect(one).toBe('/tmp');",
        "expect(one).toContain('/tmp/wb/a.json');",
      ].every((text) => pathLiteralProblems(text).length === 0);
      const template = pathLiteralProblems('expect(one).toBe(`/tmp/wb/a.json`);');
      const derived = pathLiteralProblems("const root = '/tmp/wb';\nexpect(read(root)).toBe('/tmp/wb/preflight.json');");
      const negative =
        flagged.length === 1 &&
        flagged[0]?.literal === '/tmp/wb/preflight.json' &&
        echoed.length === 0 &&
        joined.length === 0 &&
        quiet &&
        template.length === 1 &&
        derived.length === 1;
      const allowed = ALLOWED.size === 0 ? '' : `；${ALLOWED.size} 个文件登记了原因`;
      report(
        TITLE,
        hits.length === 0 && negative,
        hits.length === 0
          ? negative
            ? `扫 ${scanned} 个测试文件零命中${allowed}（判据负例也过）`
            : '判据自己的负例没过：扫描或来源判定不可信'
          : hits.join(' · '),
      );
    },
  },
];
