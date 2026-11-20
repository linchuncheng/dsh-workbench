#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { WORKBENCH_API_VERSION } from '@dsh-workbench/shared/host';
import { RELEASE_TARGETS } from '@dsh-workbench/shared/contract/protocol/release';
import { build } from '../src/build.mjs';
import { CHECKS, check } from '../src/check.mjs';
import { changelog } from '../src/release/changelog.mjs';
import { design } from '../src/contract/design.mjs';
import { init } from '../src/init.mjs';
import { marketInit } from '../src/market/market-init.mjs';
import { migrate } from '../src/contract/migrate.mjs';
import { publish } from '../src/release/publish.mjs';
import { release } from '../src/release/release.mjs';
import { sync } from '../src/contract/sync.mjs';

async function lint({ root, args }) {
  const [{ CONFIG_FILE, lintPackage }, { discoverModulePackages }] = await Promise.all([
    import('../src/checks/lint.mjs'),
    import('../src/support/discover.mjs'),
  ]);
  const fix = args.includes('--fix');
  const modulePackages = discoverModulePackages({ root });
  const declared = modulePackages.filter((pkg) => existsSync(join(pkg.dir, CONFIG_FILE)));
  if (declared.length === 0) {
    console.log(`没有模块包包含 ${CONFIG_FILE}（模块包 ${modulePackages.length} 个）—— 没有可检查的内容。`);
    return;
  }

  let failed = 0;
  for (const pkg of declared) {
    const result = await lintPackage(pkg, { fix });
    if (result.error !== undefined) {
      console.error(`✖ ${result.error}`);
      failed += 1;
      continue;
    }
    const fixed = fix ? `（已修改 ${result.fixed} 条 / 剩余 ${result.errors + result.warnings} 条）` : '';
    console.log(
      `${result.errors > 0 ? '✖' : '✔'} ${result.name}：${result.files} 个文件 · ` +
        `${result.errors} error · ${result.warnings} warn${fixed}`,
    );
    for (const problem of result.problems) console.log(`  · ${problem}`);
    for (const warning of result.warnLines) console.log(`  · ${warning}`);
    if (result.errors > 0) failed += 1;
  }
  if (failed > 0) process.exit(1);
}

const commands = { build, check, init, 'market-init': marketInit, design, migrate, publish, release, sync, lint, changelog };

const CHECK_HELP = `
查询口：
  check --only kit [--file <名字>]                      这份外壳的 kit 里有什么
  check --only primitives [--all|--files|--json] [--file <名字>]
                                                        这份外壳的 dsh 原语里有什么
  check --list [--json|--markdown]                      只列判据元数据

范围：
  check --package <包名|unit>                           只报告这个模块的问题（开发期便利，不是门禁）
                                                        全量扫描、只过滤报告与退出码`;

const MIGRATE_HELP = `
用法：
  migrate [--cwd <模块目录>] [--dry-run]

将模块清单迁移到当前版本：apiVersion → ${WORKBENCH_API_VERSION}、缺失或为空的 workbenchFaces 补充默认入口。
源码类问题（kit 成员移除、裸控件、card: null 对账）不会自动修改 —— check 会逐条指出。`;

const RELEASE_HELP = `
选项：
  --target ${RELEASE_TARGETS.join('|')}         出口；省略按配置默认（可写索引优先 market）
  --version patch|minor|major|x.y.z                     版本；省略时已存在就自动 patch
  --registry <url> --access restricted|public --npmrc <文件>
  --license <id> --out <目录> --git <remote>
  --author <署名>                                       更换署名（姓名，或 姓名 <邮箱>）；写回 package.json
  --label <短词>                                        为市场条目添加标签（1–2 个，可重复）；只写入索引条目
  --category <短词>                                     为市场条目设置分类（一个短词）；只写入索引条目，不传则沿用已有分类
  --changelog-note <文字> --changelog-type added|changed|fixed|removed|security|deprecated
                                                        该版本尚无更新日志时写入 CHANGELOG.md（文件不存在时先创建）
  --index auto|none|<目录|git 地址>                     发布后要更新的索引源
  --index-source <id> --index-ref <分支> --index-path <索引路径> --index-policy artifacts-in-repo|catalog-only
  --resume                                              上次中断后继续发布（使用记录中的出口与版本）
  --workspace-only                                      只执行工作区步骤（构建 / 检查 / 提交），索引与产物流给 --index-only
  --index-only                                          承接 --workspace-only 的记录，只执行产品侧步骤（索引 / 发布 / 产物）
  --dry-run --verify --yes --json`;

const MARKET_INIT_HELP = `
用法：
  market-init <git 地址|目录> [--ref <分支>] [--path <索引路径>] [--no-readme] [--json]

空仓库：使用仓库声明的默认分支；无法读取时用 --ref 指定（github.com 回退到 main）。
已有 commit 的仓库：只补充索引目录与 README.md，不修改已有文件。`;

const CHANGELOG_HELP = `
用法：
  changelog check [版本] [--json]

版本省略时使用 package.json 中的 version。发布时该版本必须有记录：
release --changelog-note "这一版改了什么"（文件不存在时会先创建）。`;

const COMMANDS = {
  build: '生成 dist/host.js（单文件 ESM）与 client.js（带加载器包装）',
  check: '十四条判据；--only 单独运行，也作为查询入口；--list 只列出判据元数据',
  init: '创建模块骨架（--dir / --template diy / --description；只有 diy 一个模板）',
  'market-init': '初始化市场索引仓库（写 market/ 与 README，推首个 commit）',
  design: '设计记录：init 填写 / migrate 拆分旧 README / check 检查空白 / render 生成 README 与 DEVELOPING / accept 勾选',
  migrate: '将模块清单迁移到当前版本（apiVersion / workbenchFaces）；源码类问题只提供提示',
  publish: '发布前清单：门禁 + files + npm pack（只执行 dry run）',
  release: '实际发布：全部门禁 + 验收门禁 + 预检接管 + 发布到出口 + 发布后核对 + 更新市场索引（中断后可 --resume）',
  sync: '按清单生成 src/declared-tools.ts 与 src/sites.ts，按 design.json 生成 src/datasource.ts',
  lint: '使用模块自己的 eslint.config.mjs；--fix 直接修改文件',
  changelog: '更新日志：check 检查该版本是否已有记录；发布时通过 release --changelog-note 写入',
};

function flagValue(raw, flag) {
  const at = raw.indexOf(flag);
  return at === -1 ? undefined : raw[at + 1];
}

async function dispatch(name, raw) {
  const cwd = process.env.DSH_WB_MODULE_CWD ?? process.cwd();
  const args = [];
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === '--cwd' || raw[index] === '--only') {
      index += 1;
      continue;
    }
    args.push(raw[index]);
  }
  const cwdValue = flagValue(raw, '--cwd');
  if (raw.includes('--cwd') && (cwdValue === undefined || cwdValue.startsWith('--'))) {
    console.error('✖ --cwd 后需要提供目录，例如：--cwd ./module-demo');
    process.exit(2);
  }
  const root = resolve(cwdValue ?? cwd);
  try {
    if (root !== process.cwd()) process.chdir(root);
    await commands[name]({ root, only: flagValue(raw, '--only'), args });
  } catch (error) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const program = new Command('dsh-wb-module')
  .description(`模块包的工具链：${Object.keys(COMMANDS).join(' / ')}`)
  .helpOption('-h, --help', '打印帮助')
  .addHelpText(
    'after',
    '\n  --cwd <目录>  指定工作目录（默认当前目录；判据仍按工作区发现，可用 DSH_WB_MODULE_CWD）\n  任何命令后跟 --help 都只打印帮助。\n',
  );

for (const [name, description] of Object.entries(COMMANDS)) {
  const sub = program
    .command(name)
    .description(description)
    .helpOption('-h, --help', '打印帮助')
    .allowUnknownOption(true)
    .allowExcessArguments(true);
  if (name === 'check') sub.addHelpText('after', `\n${CHECK_HELP}\n      --only 可选：${Object.keys(CHECKS).join('|')}\n`);
  if (name === 'release') sub.addHelpText('after', `${RELEASE_HELP}\n`);
  if (name === 'market-init') sub.addHelpText('after', `${MARKET_INIT_HELP}\n`);
  if (name === 'changelog') sub.addHelpText('after', `${CHANGELOG_HELP}\n`);
  if (name === 'migrate') sub.addHelpText('after', `${MIGRATE_HELP}\n`);
  sub.action(async (_options, command) => {
    await dispatch(name, command.args);
  });
}

await program.parseAsync(process.argv);
