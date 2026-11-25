import { builtinSourceForms, runGuard } from '@arch-guard/core';
import { moduleTargets } from '../support/scope.mjs';

export const title = '模块架构（分层 / 边界 / 设计系统）';

const CONFIG_FILE = 'arch.config.mjs';

const HOW_TO_JOIN =
  `在模块包里放一份 ${CONFIG_FILE}，内容一行即可：\n` +
  `    import { moduleArch } from '@dsh-workbench/module-tools/arch';\n` +
  '    export default moduleArch();\n' +
  '  形状（层序表 / 两个运行时 / 阈值）见 @dsh-workbench/module-tools/arch 的文档与 README；' +
  '需要添加例外时，通过 moduleArch() 的参数配置（deps / layers / roles / exceptions）。';

const EMPTY_REASON = '没有模块包（没有声明 dsh.workbench 的包）—— 没有源码需要判定结构';

const MISSING_REASON = '没有架构声明就无法判定';

const severityIndex = (rules) => new Map(rules.map((rule) => [rule.id, rule.severity]));

const severityOf = (finding, index) => finding.severity ?? index.get(finding.rule) ?? 'error';

function lineOf(name, finding) {
  const where = `${name}: ${finding.file}:${String(finding.line)}`;
  const hint = typeof finding.hint === 'string' && finding.hint !== '' ? ` —— ${finding.hint}` : '';
  return `${where} ${finding.text}（${finding.rule}）${hint}`;
}

export async function run(options = {}) {
  const targets = moduleTargets(options, CONFIG_FILE, HOW_TO_JOIN, EMPTY_REASON, MISSING_REASON);
  if (targets.skip !== undefined) return targets.skip;
  const { modulePackages, declared } = targets;

  const problems = [];
  let files = 0;
  let warnings = 0;

  const ranRules = new Set();

  for (const pkg of declared) {
    const name = pkg.manifest.name;
    let result;
    try {
      result = await runGuard({
        cwd: pkg.dir,

        configPath: CONFIG_FILE,
        sourceForms: builtinSourceForms,
        cache: false,
        quiet: true,
        format: 'json',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(
        `${name}: ${CONFIG_FILE} 无法运行 —— ${message}（请先确认这份配置可以 import、没有语法错误，` +
          '再确认它 import 的内容在工作区内可以解析）',
      );
      continue;
    }

    files += result.cache.misses;
    for (const stat of result.stats) ranRules.add(stat.rule);
    const index = severityIndex(result.config.rules);
    for (const finding of result.active) {
      if (severityOf(finding, index) === 'error') problems.push(lineOf(name, finding));
      else warnings += 1;
    }
  }

  if (problems.length > 0) {
    return {
      status: 'fail',

      notes: [`未通过时如何修复：先看位置与规则号，再决定"修改代码"还是"在 ${CONFIG_FILE} 中添加例外"。`],
      problems,
    };
  }

  return {
    status: 'pass',
    notes: [
      `${declared.length}/${modulePackages.length} 个模块包带有 ${CONFIG_FILE} · ${files} 个源文件 · ` +
        `${ranRules.size} 条规则已执行` +
        (warnings === 0 ? '' : ` · ${warnings} 条 warn（不挡门禁）`) +
        (declared.length === modulePackages.length ? '' : `；其余 ${modulePackages.length - declared.length} 个未声明（不适用）`),
    ],
    problems: [],
  };
}
