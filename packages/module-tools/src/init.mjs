import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { DESIGN_FILE, applyToDeveloping, readDesign, readUserSource, renderDesign, sitesOf, writeUserReadme } from './contract/design.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES = {
  diy: '../template-diy',
};
const UNIT_ID = /^[a-z][a-z0-9-]*$/;

const FALLBACK_RANGE = '^0.1.0';

const FALLBACK_DSH_UI = '0.2.2-rc.1';
const DSH_UI = '@deepseek-ai/dsh-client-ui-primitives';

const dshUiVersion = (root) => {
  try {
    const pinned = JSON.parse(
      readFileSync(join(root, 'node_modules/@dsh-workbench/core/package.json'), 'utf8'),
    ).devDependencies?.[DSH_UI];
    if (typeof pinned === 'string' && pinned !== '') {
      return { version: pinned, source: '工作台 manifest 中钉住的版本（已对账）' };
    }
  } catch {

  }
  console.error(
    `无法读取工作台 manifest 中钉住的 ${DSH_UI}：模板保持 ${FALLBACK_DSH_UI}（与工作台对账过的版本）；工程中已安装依赖时，init 会覆盖为当前版本`,
  );
  return { version: FALLBACK_DSH_UI, source: '回退常量（未读取到工作台 manifest）' };
};

const versionIn = (file) => {
  try {
    const version = JSON.parse(readFileSync(file, 'utf8')).version;
    return typeof version === 'string' && version !== '' ? version : undefined;
  } catch {
    return undefined;
  }
};

const shellRange = (root) => {
  const installed = versionIn(join(root, 'node_modules/@dsh-workbench/core/package.json'));
  if (installed !== undefined) return `^${installed}`;
  const own = versionIn(fileURLToPath(new URL('../package.json', import.meta.url)));
  if (own !== undefined) return `^${own}`;
  console.error(
    `无法读取 @dsh-workbench/core 与 module-tools 的版本：模板中那三处 @dsh-workbench/* 保持 ${FALLBACK_RANGE}（与之前一致）；工程中已安装依赖时，init 会覆盖为当前范围`,
  );
  return FALLBACK_RANGE;
};

export async function init({ root, args = [] }) {
  const unit = args[0];
  if (unit === undefined || !UNIT_ID.test(unit)) {
    console.error('用法：dsh-wb-module init <unit> [--dir <目录>] [--template diy] [--description <文字>]');
    console.error('  unit 为小写连字符标识（同时用作单元 id、包名后缀、卡片 class 前缀）');
    console.error('  --template diy：唯一模板（实际数据源 + 卡片 + 可运行的流程/工具），也是默认值');
    process.exit(2);
  }
  const templateAt = args.indexOf('--template');
  if (templateAt !== -1 && (args[templateAt + 1] === undefined || args[templateAt + 1].startsWith('--'))) {
    console.error('--template 后需要提供模板名，例如：--template diy');
    process.exit(2);
  }
  const picked = args[templateAt + 1];
  const which = templateAt === -1 ? 'diy' : picked;
  const template = TEMPLATES[which];
  if (template === undefined) {
    console.error(`无法识别的模板：${String(which)}（可用：${Object.keys(TEMPLATES).join(' / ')}）`);
    process.exit(2);
  }
  const at = args.indexOf('--dir');
  if (at !== -1 && (args[at + 1] === undefined || args[at + 1].startsWith('--'))) {
    console.error('--dir 后需要提供目录，例如：dsh-wb-module init demo --dir ./module-demo');
    process.exit(2);
  }
  const target = at === -1 ? join(root, `module-${unit}`) : args[at + 1];
  const describedAt = args.indexOf('--description');
  if (describedAt !== -1 && (args[describedAt + 1] === undefined || args[describedAt + 1].startsWith('--'))) {
    console.error('--description 后需要提供一句话，例如：--description "示例模块"');
    process.exit(2);
  }
  const description =
    describedAt === -1 ? `${unit} 模块：独立 dsh 插件包` : args[describedAt + 1];
  if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(`${target} 已存在且不是空目录，不会覆盖`);
    process.exit(2);
  }
  const dshUi = dshUiVersion(root);
  const tokens = {
    __UNIT__: unit,
    __NAME__: `@dsh-workbench/module-${unit}`,
    __DESC__: description,
    __SHELL_RANGE__: shellRange(root),
    __DSH_UI_VERSION__: dshUi.version,
  };

  const fill = (text) =>
    text.replace(new RegExp(Object.keys(tokens).join('|'), 'g'), (token) => tokens[token]);
  const templateDir = fileURLToPath(new URL(template, import.meta.url));
  if (!existsSync(templateDir)) {
    console.error(`模板 ${which} 的目录不存在：${templateDir}`);
    process.exit(2);
  }
  cpSync(templateDir, target, { recursive: true });
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(tpl|ts|tsx|json|md|yml)$/.test(entry.name)) continue;
      writeFileSync(full, fill(readFileSync(full, 'utf8')));
      if (/\.tpl$/.test(entry.name)) {
        const stripped = join(dir, entry.name.replace(/\.tpl$/, ''));
        cpSync(full, stripped);
        rmSync(full);
      }
    }
  };
  walk(target);
  const declared = readDesign(target);
  if (declared !== undefined) {
    applyToDeveloping(target, renderDesign(declared, sitesOf(target) ?? undefined));
    const source = readUserSource(target);
    if (source !== undefined) writeUserReadme(target, source);
  }
  const tables = existsSync(join(target, DESIGN_FILE)) ? `${DESIGN_FILE} 里那份三张表` : '还没有三张表（dsh-wb-module design init 生成）';
  console.log(`${target} 已创建：${unit} 模块骨架（模板 ${which}；build / check / design / selfcheck 已接入工具）`);
  console.log(`  需求底稿位于 ${tables}；空白项用 dsh-wb-module design check 检查，readme.json 生成用户 README，design.json 生成 DEVELOPING.md`);
  console.log(`  模板默认包含 ${DSH_UI}@${dshUi.version}（${dshUi.source}）—— 涉及 dsh 原语的类型面与 external 声明两处；`);
  console.log('  确实不需要时，将 devDependencies 与 dsh.client.external 两处一并删除，判据不会拦截。');
}
