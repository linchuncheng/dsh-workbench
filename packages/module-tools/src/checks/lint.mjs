import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { ESLint } from 'eslint';
import { discoverModulePackages } from '../support/discover.mjs';
import { scopedPackages } from '../support/scope.mjs';
import { DIALECT_BLOCKS, DIALECT_IGNORES, FINGERPRINT, dialectShapeOf, isGlobalIgnoresBlock } from '../lint.mjs';

export const title = '模块代码卫生（eslint）';

export const CONFIG_FILE = 'eslint.config.mjs';

const MAX_PROBLEMS = 40;

const HOW_TO_JOIN =
  `在模块包里放一份 ${CONFIG_FILE}，内容两行即可（与模板中的那份逐字一致）：\n` +
  `    import { moduleLint } from '@dsh-workbench/module-tools/lint';\n` +
  '    export default moduleLint({ rootDir: import.meta.dirname });\n' +
  '  `rootDir` 是给 typescript-eslint 钉 tsconfigRootDir 的（一个进程里同时有多份 eslint 配置时必需；\n' +
  '  模块单独运行一份配置时可以省略）。规则与阈值只有这一份（随 @dsh-workbench/module-tools 同代）；\n' +
  '  需要添加例外时，通过 moduleLint({ ignores, rules, rootDir }) 的参数配置。';

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

const TEXT_LIMIT = 200;
function oneLine(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > TEXT_LIMIT ? `${flat.slice(0, TEXT_LIMIT)}…` : flat;
}

function lineOf(name, dir, result, message) {
  const line = message.line ?? 1;
  const column = message.column ?? 1;
  const where = `${name}: ${relative(dir, result.filePath)}:${String(line)}:${String(column)}`;
  const rule = message.ruleId ?? '解析错误';
  return `${where} ${rule} —— ${oneLine(message.message)}`;
}

const DIALECT_NAMES = new Set(DIALECT_BLOCKS.map((block) => block.name));

function isDialectNamed(block) {
  return (
    block !== null &&
    typeof block === 'object' &&
    typeof block.name === 'string' &&
    (DIALECT_NAMES.has(block.name) || block.name.startsWith(`${FINGERPRINT}/`))
  );
}

function hasDialectTrace(config) {
  return config.some((block) => isGlobalIgnoresBlock(block) || isDialectNamed(block));
}

function globalIgnoresOf(config) {
  const globs = new Set();
  for (const block of config) {
    if (block !== null && typeof block === 'object' && isGlobalIgnoresBlock(block)) {
      for (const glob of block.ignores) globs.add(glob);
    }
  }
  return globs;
}

function rulesDivergenceOf(expected, actual) {
  const gone = Object.keys(expected).filter((rule) => !(rule in actual));
  const extra = Object.keys(actual).filter((rule) => !(rule in expected));
  const changed = Object.keys(expected).filter(
    (rule) => rule in actual && !isDeepStrictEqual(expected[rule], actual[rule]),
  );
  const parts = [];
  if (gone.length > 0) parts.push(`少了 ${gone.join('、')}`);
  if (extra.length > 0) parts.push(`多了 ${extra.join('、')}`);
  if (changed.length > 0) parts.push(`改了 ${changed.join('、')}`);
  return parts.join('；');
}

function dialectDivergences(config) {
  const blocks = config.filter((block) => block !== null && typeof block === 'object');
  const problems = [];

  const missingGlobs = DIALECT_IGNORES.filter((glob) => !globalIgnoresOf(config).has(glob));
  if (missingGlobs.length > 0) problems.push(`少了全局 ignores（缺 ${missingGlobs.join('、')}）`);

  for (const expected of DIALECT_BLOCKS) {
    const same = blocks.filter((block) => block.name === expected.name);
    if (same.length === 0) {
      problems.push(`少了「${expected.name}」那一块`);
      continue;
    }
    if (same.length > 1) {
      problems.push(`「${expected.name}」出现了 ${String(same.length)} 次（同名块只有最后一块算数）`);
      continue;
    }
    const actual = dialectShapeOf(same[0]);
    if (!isDeepStrictEqual(actual.files, expected.files)) {
      problems.push(`改了「${expected.name}」那一块的 files`);
      continue;
    }
    const rules = rulesDivergenceOf(expected.rules, actual.rules);
    if (rules !== '') problems.push(`改了「${expected.name}」那一块的 rules（${rules}）`);
  }
  return problems;
}

async function loadConfig(pkg) {
  const file = join(pkg.dir, CONFIG_FILE);
  let module_;
  try {
    module_ = await import(pathToFileURL(file).href);
  } catch (error) {
    return {
      error:
        `${pkg.manifest.name}: ${CONFIG_FILE} 无法运行 —— ${messageOf(error)}` +
        '（请先确认这份配置可以 import、没有语法错误，再确认它 import 的内容在工作区内可以解析）',
    };
  }

  const config = module_.default;
  if (!Array.isArray(config)) {
    return {
      error:
        `${pkg.manifest.name}: ${CONFIG_FILE} 的默认导出不是 flat config 数组 —— ` +
        `这份配置不是由 moduleLint() 生成的。\n  ${HOW_TO_JOIN}`,
    };
  }
  if (!hasDialectTrace(config)) {
    return {
      error:
        `${pkg.manifest.name}: ${CONFIG_FILE} 里没有 ${FINGERPRINT} 那几块 —— ` +
        `这份配置不是由 moduleLint() 生成的（要添加规则，请展开 moduleLint() 再追加一块，不要手写一份自己的规则集）。` +
        `\n  ${HOW_TO_JOIN}`,
    };
  }
  const diverged = dialectDivergences(config);
  if (diverged.length > 0) {
    return {
      error:
        `${pkg.manifest.name}: ${CONFIG_FILE} 里的规则集与 moduleLint() 产出的不一致 —— ` +
        `${diverged.join('；')}。需要添加例外时请使用 moduleLint({ rules, ignores })（rules 落在 ` +
        `${FINGERPRINT}/overrides 那块、ignores 加在全局 ignores 那块）或展开 moduleLint() ` +
        '再追加自己的一块，不要修改规则集那几块。',
    };
  }
  return { config };
}

export async function lintPackage(pkg, { fix = false } = {}) {
  const name = pkg.manifest.name;
  const loaded = await loadConfig(pkg);
  if (loaded.error !== undefined) return { name, error: loaded.error };

  const runOnce = (fixMode) =>
    new ESLint({
      cwd: pkg.dir,

      overrideConfigFile: true,

      overrideConfig: [
        {

          languageOptions: { parserOptions: { tsconfigRootDir: pkg.dir } },
        },
        ...loaded.config,
      ],
      errorOnUnmatchedPattern: false,
      cache: true,
      cacheLocation: join(pkg.dir, 'node_modules/.cache/eslint'),
      fix: fixMode,
    }).lintFiles(['.']);

  let results;
  let before;
  try {
    before = fix ? await runOnce(false) : undefined;
    if (fix) {
      const fixed = await runOnce(true);
      await ESLint.outputFixes(fixed);
    }
    results = await runOnce(false);
  } catch (error) {
    return { name, error: `${name}: ${CONFIG_FILE} 无法运行 —— ${messageOf(error)}` };
  }

  const problems = [];
  const warnLines = [];
  let files = 0;
  let errors = 0;
  let warnings = 0;
  for (const result of results) {
    files += 1;
    errors += result.errorCount;
    warnings += result.warningCount;
    for (const message of result.messages) {
      if (message.severity === 2) problems.push(lineOf(name, pkg.dir, result, message));
      else warnLines.push(lineOf(name, pkg.dir, result, message));
    }
  }

  const totalOf = (list) => list.reduce((sum, result) => sum + result.errorCount + result.warningCount, 0);
  return {
    name,
    files,
    errors,
    warnings,
    problems,
    warnLines,
    fixed: before === undefined ? 0 : totalOf(before) - (errors + warnings),
  };
}

export async function run(options = {}) {
  const modulePackages = scopedPackages(discoverModulePackages({ root: process.cwd() }), options.scope);
  if (modulePackages.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有源码需要判定代码卫生'],
      problems: [],
    };
  }

  const declared = modulePackages.filter((pkg) => existsSync(join(pkg.dir, CONFIG_FILE)));
  if (declared.length === 0) {
    return {
      status: 'skip',
      notes: [
        `${modulePackages.length} 个模块包都没有 ${CONFIG_FILE} —— 没有这份配置就没有规则可运行（不代表没有问题）。` +
          `\n  ${HOW_TO_JOIN}`,
      ],
      problems: [],
    };
  }

  const problems = [];
  const warnLines = [];
  let files = 0;
  let errors = 0;
  let warnings = 0;

  for (const pkg of declared) {
    const result = await lintPackage(pkg);
    if (result.error !== undefined) {
      problems.push(result.error);
      continue;
    }
    files += result.files;
    errors += result.errors;
    warnings += result.warnings;
    problems.push(...result.problems);
    warnLines.push(...result.warnLines);
  }

  if (problems.length > 0) {

    const only = process.env.DSH_WB_ONLY === 'lint' || options.scope !== undefined;
    const shown = only ? problems : problems.slice(0, MAX_PROBLEMS);
    const notes = [
      '未通过时如何修复：先看位置与规则名，再决定"修改代码"还是"就地 eslint-disable-next-line"；' +
        '需要整体放开时，展开 moduleLint() 再追加一块（不要替换规则集）。',
    ];
    if (shown.length < problems.length) {
      notes.push(`还有 ${problems.length - shown.length} 条未列出（运行 dsh-wb-module check --only lint 查看全部）。`);
    }
    return { status: 'fail', notes, problems: shown };
  }

  const notes = [
    `${declared.length}/${modulePackages.length} 个模块包带有 ${CONFIG_FILE} · ${files} 个文件 · ` +
      `${errors} error · ${warnings} warn`,
  ];
  if (warnLines.length > 0 && process.env.DSH_WB_ONLY === 'lint') {
    notes.push('warn（不挡门禁）：');
    for (const line of warnLines) notes.push(`  ${line}`);
  }
  if (declared.length < modulePackages.length) {
    notes.push(`其余 ${modulePackages.length - declared.length} 个没有 ${CONFIG_FILE}（不适用）`);
  }
  return { status: 'pass', notes, problems: [] };
}
