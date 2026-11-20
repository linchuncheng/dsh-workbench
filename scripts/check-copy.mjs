import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAIL_ON_RED = process.argv.includes('--fail-on-red');
const SCOPE_ARG = process.argv.find((value) => value.startsWith('--scope='));
const SCOPE = SCOPE_ARG === undefined ? 'all' : SCOPE_ARG.slice('--scope='.length);

function pairsOf(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    });
}

const COLLOQUIAL = pairsOf(`
这一下=本次操作
这一块=这里
这一跳=这一步
这一轮=本次
长这样=界面预览
点进去=打开
点一下=选择
点开=打开
点头=批准
上板=显示在看板
收工=结束
在跑=运行中
跑完=已完成
跑一遍=运行一次
起不来=启动失败
盘上=已安装
装上=安装
造一个=创建一个
装好=安装完成
卸掉=卸载
换上=更新生效
粘到=粘贴到
弄好=处理完成
搞定=完成
就好=
就行=
帮你=
替你=
不用你点=
咱们=
我们=
自己动手=手动处理
装坏=安装损坏
跑在=运行在
没认出=无法识别
没跑通=未成功
拦下=阻止
重跑=重新运行
已拍=已截图
卡在=受阻于
真跑=实际运行
跑门禁=运行自动检查
跑起来=运行
跑一次=运行一次
跑通=运行成功
判红=判定失败
报红=判定失败
全绿=全部通过
落红=判定失败
手搓=手写
堆进=堆积在
漂了=不一致
别手改=不要手动修改
盖回去=覆盖
收口=统一
写死=固定
拍板=确定
塞进=写入
塞私货=写入未定义的键
`);

const INTERNAL_UI = pairsOf(`
profile=工作台配置
adapter=后台适配组件
schema=
payload=
bundle=
patch=
stderr=
probe=
daemon=
opencli=
套件=模块
宿主=
索引源=模块来源
适配器集合=后台适配组件
体检=启动检查
模块 id=模块标识
产物目录=打包文件位置
上下文=会话上下文
投影=数据
装配=初始化
收窄=限制
落盘=写入
兜底=默认处理
外壳=工作台
方言=规则集
门禁=自动检查
判据=检查项
执行缝=命令执行入口
门面=统一入口
契约=接口约定
棘轮=只减不增
豁免表=例外清单
归因=定位来源
生字段=未知字段
五态=五种状态
底稿=设计记录
空壳=空模板
`);

const TERMINOLOGY = pairsOf(`
套件=模块
索引源=模块来源
模块 id=模块标识
产物目录=打包文件位置
体检=启动检查
适配器集合=后台适配组件
外壳=工作台
方言=规则集
空壳=空模板
五态=五种状态
底稿=设计记录
`);

const allowlist = JSON.parse(readFileSync(join(ROOT, 'scripts/copy-allowlist.json'), 'utf8'));
const findings = [];

function isAllowed(file, term, context) {
  return allowlist.some((entry) => {
    if (entry.file !== undefined && entry.file !== file) return false;
    if (entry.term !== undefined && entry.term !== term) return false;
    if (entry.contains !== undefined && !context.includes(entry.contains)) return false;
    return true;
  });
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

function addFinding(file, line, severity, term, replacement, context) {
  if (isAllowed(file, term, context)) return;
  findings.push({ file, line, severity, term, replacement, context: context.trim().replace(/\s+/g, ' ').slice(0, 140) });
}

function matches(term, context) {
  if (/^[a-z]+$/.test(term)) return new RegExp('\\b' + term + '\\b').test(context);
  return context.includes(term);
}

function scanValue(file, line, severity, context, mode) {
  const rules = mode === 'ui' ? [...COLLOQUIAL, ...INTERNAL_UI] : mode === 'tool' ? [...COLLOQUIAL, ...TERMINOLOGY] : COLLOQUIAL;
  const searchable = context.replace(/\{[^}]*\}/g, '');
  for (const [term, replacement] of rules) {
    if (!matches(term, searchable)) continue;
    addFinding(file, line, severity, term, replacement, context);
  }
}

function scanMarkdown(file, severity) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  let fenced = false;
  text.split('\n').forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    scanValue(file, index + 1, severity, line, 'doc');
  });
}

function scanI18n(file) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  const pattern = /'([^']+)'\s*:\s*'((?:[^'\\]|\\.)*)'/g;
  for (const match of text.matchAll(pattern)) {
    const value = match[2];
    if (!/[\u4e00-\u9fa5]/.test(value)) continue;
    scanValue(file, lineAt(text, match.index), 'error', value, 'ui');
  }
}

function scanCode(file) {
  const text = readFileSync(join(ROOT, file), 'utf8');
  if (!/[\u4e00-\u9fa5]/.test(text)) return;
  const pattern = /(['"`])((?:[^'"`\\\n]|\\.)*[\u4e00-\u9fa5](?:[^'"`\\\n]|\\.)*)\1/g;
  for (const match of text.matchAll(pattern)) {
    const line = lineAt(text, match.index);
    const source = text.split('\n')[line - 1] ?? '';
    if (/\blogger\b|\bconsole\./.test(source)) continue;
    scanValue(file, line, 'error', match[2], 'tool');
  }
}

function walk(dir, skip) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (skip.has(entry.name)) continue;
    if (entry.isDirectory()) {
      out.push(...walk(path, skip));
      continue;
    }
    out.push(path);
  }
  return out;
}

const I18N = [
  'packages/shared/src/i18n/zh.ts',
  'packages/shared/src/i18n/settings.ts',
  'packages/shared/src/i18n/need-text.ts',
  'packages/shared/src/i18n/runtime-terms.ts',
  'packages/module-hello/src/messages.ts',
];
const TOOLS = walk('packages/core/src/modules', new Set(['__tests__', 'dist', 'node_modules'])).filter((file) => file.endsWith('.ts'));
const MODULE_TOOLS = [
  ...walk('packages/module-tools/src', new Set(['__tests__', 'dist', 'node_modules'])).filter((file) => file.endsWith('.mjs')),
  ...walk('packages/module-tools/bin', new Set(['node_modules'])).filter((file) => file.endsWith('.mjs')),
];
const SKILLS = walk('packages/core/skills', new Set(['node_modules'])).filter(
  (file) => file.endsWith('.md') && !file.endsWith('/COPY.md'),
);
const DOCS = [
  'README.md',
  'packages/module-tools/README.md',
  ...walk('packages/module-tools/template-diy', new Set(['node_modules'])).filter((file) => file.endsWith('.md')),
  'packages/core/README.md',
  ...walk('packages/docs/site/desktop/views', new Set(['node_modules'])).filter((file) => file.endsWith('.md')),
];

if (SCOPE === 'all' || SCOPE === 'ui') I18N.forEach(scanI18n);
if (SCOPE === 'all' || SCOPE === 'tools') TOOLS.forEach(scanCode);
if (SCOPE === 'all' || SCOPE === 'tools') MODULE_TOOLS.forEach(scanCode);
if (SCOPE === 'all' || SCOPE === 'docs') {
  SKILLS.forEach((file) => scanMarkdown(file, 'warn'));
  DOCS.forEach((file) => scanMarkdown(file, 'warn'));
}

const errors = findings.filter((item) => item.severity === 'error');
const warnings = findings.filter((item) => item.severity === 'warn');
const byTerm = new Map();
for (const item of findings) byTerm.set(item.term, (byTerm.get(item.term) ?? 0) + 1);

console.log(`文案检查：${FAIL_ON_RED ? 'fail-on-red' : 'report-only'}，范围 ${SCOPE}`);
console.log(`错误 ${errors.length} 条；提醒 ${warnings.length} 条；命中词 ${byTerm.size} 个`);
console.log(
  [...byTerm.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([term, count]) => `${term}×${count}`)
    .join('  '),
);
console.log('');
for (const item of [...errors, ...warnings]) {
  const label = item.severity === 'error' ? '错误' : '提醒';
  const fix = item.replacement === '' ? '删掉' : `改成「${item.replacement}」`;
  console.log(`${item.file}:${item.line}  [${label}]  ${item.term} → ${fix}  | ${item.context}`);
}

if (FAIL_ON_RED && errors.length > 0) process.exit(1);
