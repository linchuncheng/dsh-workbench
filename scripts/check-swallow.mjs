import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, '.swallow-baseline.json');
const TARGETS = ['packages', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'site-dist', '__tests__', 'vendor', 'test']);
const SOURCE = /\.(?:ts|tsx|mjs|cjs|js)$/;
const GENERATED = /(?:^|[\\/])(?:client|client\.body)\.js$|\.generated\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TOP_LIMIT = 12;
const LIST_LIMIT = 25;
const EXCLUDED_BUCKETS = new Set(['failure-return']);

const OBSERVABLE_CALLS = new Set([
  'log',
  'warn',
  'error',
  'report',
  'emit',
  'notify',
  'trace',
  'debug',
  'fail',
  'failure',
  'invalid',
  'refuse',
  'problem',
  'print',
  'assert',
  'abort',
  'panic',
]);

const LOGGING_CALL = /^(?:append|write|emit|log|note|warn|report|record|mark|notify)[A-Z_]|(?:Log|Note|Warn|Report)$/;

const FINDING_RECEIVERS = /problem|finding|issue|error|warn|diagnostic|refus|fail/i;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (!SOURCE.test(entry.name) || TEST_FILE.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    if (GENERATED.test(full)) continue;
    out.push(full);
  }
  return out;
}

function sourceFiles() {
  const out = [];
  for (const target of TARGETS) {
    const dir = join(ROOT, target);
    if (!existsSync(dir)) continue;
    walk(dir, out);
  }
  return out.sort();
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function textOf(node, sf) {
  return sf.text.slice(node.getStart(sf), node.getEnd());
}

function normal(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function digest(text) {
  return createHash('sha1').update(normal(text)).digest('hex').slice(0, 12);
}

function callName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return '';
}

function observableIn(node, sf) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isThrowStatement(child)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(child)) {
      const name = callName(child.expression);
      if (OBSERVABLE_CALLS.has(name) || LOGGING_CALL.test(name)) {
        found = true;
        return;
      }
      if (
        /^(?:set|report|mark|note|record|on)[A-Za-z]*(?:Failure|Error|Problem|Refusal|Broken|Corrupt)$/.test(name)
      ) {
        found = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(child.expression) &&
        child.expression.name.text === 'push' &&
        FINDING_RECEIVERS.test(textOf(child.expression.expression, sf))
      ) {
        found = true;
        return;
      }
    }
    if (ts.isPropertyAccessExpression(child)) {
      const owner = textOf(child.expression, sf);
      if (owner === 'console' || owner === 'process') {
        found = true;
        return;
      }
    }
    if (ts.isBinaryExpression(child) && ts.isPropertyAccessExpression(child.left)) {
      if (textOf(child.left.expression, sf) === 'process' && child.left.name.text === 'exitCode') {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function literalLike(node, sf) {
  if (ts.isParenthesizedExpression(node)) return literalLike(node.expression, sf);
  if (ts.isArrayLiteralExpression(node)) return node.elements.every((one) => literalLike(one, sf));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every((one) => {
      if (ts.isShorthandPropertyAssignment(one)) return true;
      if (!ts.isPropertyAssignment(one)) return false;
      return literalLike(one.initializer, sf);
    });
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return true;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return true;
  if (ts.isNumericLiteral(node) || ts.isVoidExpression(node) || ts.isPrefixUnaryExpression(node)) return true;
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.UndefinedKeyword
  );
}

function failureShape(node) {
  if (ts.isParenthesizedExpression(node)) return failureShape(node.expression);
  if (ts.isObjectLiteralExpression(node)) {
    if (node.properties.some((one) => ts.isPropertyAssignment(one) && one.name.getText() === 'reason')) {
      return true;
    }
    const field = (name, wanted) =>
      node.properties.some(
        (one) => ts.isPropertyAssignment(one) && one.name.getText() === name && one.initializer.getText() === wanted,
      );
    return (
      field('ok', 'false') ||
      field('success', 'false') ||
      field('verified', 'false') ||
      field('kind', "'error'") ||
      field('kind', "'failed'") ||
      field('status', "'failed'") ||
      field('status', "'error'") ||
      field('kind', "'broken'") ||
      field('kind', "'corrupt'") ||
      field('kind', "'unreadable'")
    );
  }
  if (ts.isCallExpression(node)) return /^(?:fail|problem|invalid|refuse)/.test(callName(node.expression));
  return false;
}

function bucketOf(statements, expression, sf) {
  if (expression !== undefined) {
    if (failureShape(expression)) return 'failure-return';
    return literalLike(expression, sf) ? 'return-literal' : 'return-other';
  }
  if (statements.length === 0) return 'empty';
  if (statements.every((one) => ts.isContinueStatement(one) || ts.isBreakStatement(one))) return 'control';
  const returns = statements.filter((one) => ts.isReturnStatement(one));
  if (returns.length > 0) {
    const shapes = returns.map((one) => {
      if (one.expression === undefined) return 'literal';
      if (failureShape(one.expression)) return 'failure';
      return literalLike(one.expression, sf) ? 'literal' : 'value';
    });
    if (shapes.every((one) => one === 'failure')) return 'failure-return';
    if (shapes.every((one) => one === 'literal')) return 'return-literal';
    return 'return-other';
  }
  const assignments = statements.filter(
    (one) =>
      ts.isExpressionStatement(one) &&
      (ts.isBinaryExpression(one.expression) || ts.isDeleteExpression(one.expression)),
  );
  return assignments.length === statements.length ? 'assign-only' : 'other';
}

function lineAt(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function scan(file) {
  const text = readFileSync(file, 'utf8');
  if (!/\bcatch\b/.test(text)) return { catches: 0, dotcatches: 0, sites: [] };
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const hits = [];
  let catches = 0;
  let dotcatches = 0;
  const rel = relative(ROOT, file).split('\\').join('/');
  const consider = (kind, body, bucket, line) => {
    if (EXCLUDED_BUCKETS.has(bucket)) return;
    const shape = normal(body);
    hits.push({ file: rel, line, kind, bucket, shape, digest: digest(shape) });
  };
  const visit = (node) => {
    if (ts.isCatchClause(node)) {
      catches += 1;
      if (!observableIn(node.block, sf)) {
        consider('catch', textOf(node.block, sf), bucketOf(node.block.statements, undefined, sf), lineAt(sf, node));
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch'
    ) {
      dotcatches += 1;
      const handler = node.arguments[0];
      if (handler === undefined) {
        consider('dotcatch', '', 'empty', lineAt(sf, node));
      } else if (
        (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
        !observableIn(handler.body, sf)
      ) {
        const block = ts.isBlock(handler.body) ? handler.body : undefined;
        consider(
          'dotcatch',
          textOf(handler, sf),
          bucketOf(block?.statements ?? [], block === undefined ? handler.body : undefined, sf),
          lineAt(sf, node),
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { catches, dotcatches, sites: hits };
}

function keyOf(site) {
  return `${site.file}|${site.kind}|${site.digest}`;
}

function readBaseline() {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (parsed?.version !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) return {};
    return parsed.entries;
  } catch (error) {
    console.error(
      `⚠️  读不到 .swallow-baseline.json（${error instanceof Error ? error.message : String(error)}）：先按空基线算`,
    );
    return {};
  }
}

function writeBaseline(sites) {
  const entries = {};
  for (const site of sites) {
    const key = keyOf(site);
    entries[key] = (entries[key] ?? 0) + 1;
  }
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ version: 1, generatedBy: 'scripts/check-swallow.mjs', entries: sorted }, null, 2)}\n`,
  );
  return Object.keys(sorted).length;
}

function surplus(sites, baseline) {
  const seen = new Map();
  const out = [];
  for (const site of sites) {
    const key = keyOf(site);
    const at = (seen.get(key) ?? 0) + 1;
    seen.set(key, at);
    if (at > (baseline[key] ?? 0)) out.push(site);
  }
  return out;
}

const ORDER = ['empty', 'return-literal', 'return-other', 'assign-only', 'control', 'other'];

function main() {
  const files = sourceFiles();
  let catches = 0;
  let dotcatches = 0;
  const sites = [];
  for (const file of files) {
    const read = scan(file);
    catches += read.catches;
    dotcatches += read.dotcatches;
    sites.push(...read.sites);
  }
  if (process.argv.includes('--report')) {
    for (const site of sites) console.log(`${site.file}:${site.line}\t${site.kind}/${site.bucket}\t${site.shape.slice(0, 160)}`);
    return 0;
  }
  if (process.argv.includes('--accept')) {
    const keys = writeBaseline(sites);
    console.log(`✔ 基线已重写：.swallow-baseline.json（${keys} 个键 / ${sites.length} 处静默处理；和代码一起提交）`);
    return 0;
  }
  const baseline = readBaseline();
  const known = Object.values(baseline).reduce((sum, one) => sum + one, 0);
  const fresh = surplus(sites, baseline);
  const buckets = new Map();
  const byFile = new Map();
  for (const site of sites) {
    buckets.set(site.bucket, (buckets.get(site.bucket) ?? 0) + 1);
    byFile.set(site.file, (byFile.get(site.file) ?? 0) + 1);
  }
  console.log(
    `静默处理：${sites.length} 处（catch ${catches} / .catch ${dotcatches}）；基线 ${known} 处（按 文件 × 形态 计数）`,
  );
  const parts = ORDER.filter((one) => buckets.has(one)).map((one) => `${one} ${buckets.get(one)}`);
  if (parts.length > 0) console.log(`  形态：${parts.join(' · ')}`);
  for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_LIMIT)) {
    console.log(`  · ${file}：${count}`);
  }
  if (fresh.length > 0) {
    console.log(`  ${fresh.length} 处不在基线里：`);
    for (const site of fresh.slice(0, LIST_LIMIT)) {
      console.log(`    ${site.file}:${site.line} [${site.kind}/${site.bucket}] ${site.shape.slice(0, 100)}`);
    }
    if (fresh.length > LIST_LIMIT) console.log(`    …还有 ${fresh.length - LIST_LIMIT} 处，跑 pnpm run swallow:report 看全量`);
  }
  if (process.argv.includes('--fail-on-new') && fresh.length > 0) {
    console.error(`✖ 新增 ${fresh.length} 处静默处理（不在基线里）：改掉它，或运行 pnpm run swallow:accept`);
    return 1;
  }
  console.log(
    process.argv.includes('--fail-on-new')
      ? '✔ 没有新增的静默处理'
      : '✔ 本次只报告，不判失败：存量在基线里，新增的看上面清单',
  );
  return 0;
}

process.exit(main());
