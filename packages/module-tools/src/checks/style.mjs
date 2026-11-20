import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import postcss from 'postcss';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DSW_PREFIX, dshHome, nearestTokens, readTokens } from '@dsh-workbench/shared/host';
import { shellRulesIn } from '../build/css-shell.mjs';
import { discoverModulePackages } from '../support/discover.mjs';
import { auditFontSizes, fontScaleNotes, fontScaleOf } from '../build/font-scale.mjs';

const BARE_ANCHOR = /(?<![\w$])(?:h\(\s*['"]a['"]|jsx\(\s*['"]a['"]|<a(?=[\s>/]))/g;

const BARE_CONTROLS = [
  { tag: 'button', what: '按钮', use: 'dsh 的 Button（variant / size），或 kit 的 SaveBar / BlockerState' },
  { tag: 'input', what: '单行输入', use: 'kit 的 TextField' },
  { tag: 'select', what: '下拉', use: 'kit 的 SelectField（搜索 / 分组 / 空态 / 加载态都自带）' },
];
const NATIVE_ONLY_INPUT = /type\s*[:=]\s*['"](?:hidden|file)['"]/;

const CONTROL_EXEMPT = new Set([]);

const FORM_LABEL_ELEMENT = /<(span|label|div)\b[^>]*className\s*=\s*(?:\{[^}]*\}|"[^"]*")[^>]*>/;
const LABEL_CLASS = /label/i;
const I18N_LABEL_KEY = /['"][^'"]*\.(?:field|label)(?:['".])/;
const FORM_CONTROL = /<(SelectField|TextField|ChoiceGroup|Input)\b/;
const FORM_LAYER = /<(FormRows?|Field)\b/;

const NOT_A_FORM = /card|list|item|issue|env|dot|sub|chip|badge|tag|tab|nav|menu/i;
const ZERO_LENGTH = /^(?:0|0px|0rem|0em|0%|none|auto)$/i;

const ACTION_AREA_CLASS = /wb-formActions/;

const BARE_FORM = /(?:h\(\s*['"]form['"]|jsx\(\s*['"]form['"]|<form(?=[\s>/]))/g;

const FORM_SLOT_CLASS = /(?<![-\w])(?:wb-formRows?(?![\w-])|wb-field(?![\w-]))/;

function isFormContainer(token) {
  return token.split(/(?=[A-Z])/).some((word) => /^(?:fields?|forms?)$/i.test(word))
    || /^(?:fields?|forms?)$/i.test(token);
}

function rowSpacingOf(property, value) {
  const prop = property.toLowerCase();
  const first = value.trim().split(/\s+/)[0] ?? '';
  if (prop === 'gap' || prop === 'row-gap') return ZERO_LENGTH.test(first) ? null : prop;
  if (prop === 'margin-top' || prop === 'margin-bottom' || prop === 'margin-block'
    || prop === 'margin-block-start' || prop === 'margin-block-end') {
    return ZERO_LENGTH.test(first) ? null : prop;
  }
  if (prop === 'margin') {
    const parts = value.trim().split(/\s+/);
    const vertical = [parts[0] ?? '', parts.length >= 3 ? (parts[2] ?? '') : (parts[0] ?? '')];
    return vertical.some((one) => !ZERO_LENGTH.test(one)) ? prop : null;
  }
  return null;
}

function selfManagedRowsIn(css) {
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    return [];
  }
  const hits = [];
  root.walkRules((rule) => {
    const selector = rule.selector.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
    const form = Array.from(selector.matchAll(/\.([A-Za-z][\w-]*)/g), (one) => one[1])
      .filter((token) => isFormContainer(token) && !NOT_A_FORM.test(token));
    if (form.length === 0) return;
    rule.walkDecls((decl) => {
      const prop = rowSpacingOf(decl.prop, decl.value);
      if (prop === null) return;
      hits.push({
        line: decl.source?.start?.line ?? 1,
        selector: selector.slice(0, 60),
        prop,
        decl: `${decl.prop}: ${decl.value}`.slice(0, 60),
      });
    });
  });
  return hits;
}

function handwrittenRowsIn(text) {
  const lines = text.split('\n');
  const hits = [];
  const claimed = new Set();
  for (let at = 0; at < lines.length; at += 1) {
    const open = lines[at].match(FORM_LABEL_ELEMENT);
    if (open === null) continue;
    const tag = open[1];
    const named = (() => {
      const found = lines[at].match(/className\s*=\s*(?:\{([^}]*)\}|"([^"]*)")/);
      return LABEL_CLASS.test(found?.[1] ?? found?.[2] ?? '');
    })();
    const close = new RegExp(`</${tag}>`);
    let end = -1;
    let keyed = false;
    for (let scan = at; scan < Math.min(lines.length, at + 5); scan += 1) {
      if (I18N_LABEL_KEY.test(lines[scan])) keyed = true;
      if (close.test(lines[scan])) {
        end = scan;
        break;
      }
    }
    if (end < 0 || (!named && !keyed)) continue;
    for (let scan = end + 1; scan < Math.min(lines.length, end + 13); scan += 1) {
      if (FORM_LAYER.test(lines[scan])) break;
      const control = lines[scan].match(FORM_CONTROL);
      if (control === null) continue;
      if (!claimed.has(scan)) {
        claimed.add(scan);
        hits.push({ line: scan + 1, labelLine: at + 1, control: control[1] });
      }
      break;
    }
  }
  return hits;
}

const FORM_ROW_EXEMPT = new Map([]);

const FORM_ACTIONS_EXEMPT = new Map([]);

const FORM_EXEMPT = new Map([]);

const ANCHOR_EXEMPT = new Map([
  [
    '@dsh-workbench/module-demo-anchor-exempt:src/components/IssueRow.tsx',
    '自检探针：整行链接形态的裸 `<a>`（仅在这个临时探针包中出现）',
  ],
  [
    '@pagoda-dsh-workbench/module-argocd:src/components/views/EnvRows.tsx',
    '图标按钮 / 按钮外观 / 整行链接：外观与交互沿用既有视图，文字链接已使用 kit 的 Link',
  ],
  [
    '@pagoda-dsh-workbench/module-argocd:src/components/views/IdentityFields.tsx',
    '图标按钮 / 按钮外观：登录入口沿用既有视图，文字链接已使用 kit 的 Link',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-analysis:src/components/views/AnalysisBody.tsx',
    '图标按钮：卡片角上的外链按钮，不是正文文字链接',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-analysis:src/components/views/AnalysisStates.tsx',
    '按钮外观的链接：空态行动区，沿用既有视图',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-analysis:src/components/views/EnvSettings.tsx',
    '按钮外观的链接：设置区行动入口，沿用既有视图',
  ],
  [
    '@pagoda-dsh-workbench/module-coding-issues:src/components/IssueRow.tsx',
    '整行链接：缺陷行整行可点击，不是正文文字链接',
  ],
]);

function bareControlsIn(text) {
  const hits = [];
  for (const one of BARE_CONTROLS) {
    const pattern = new RegExp(
      `(?:h\\(\\s*['"]${one.tag}['"]|jsx\\(\\s*['"]${one.tag}['"]|<${one.tag}(?=[\\s>/]))`,
      'g',
    );
    for (const match of text.matchAll(pattern)) {
      if (one.tag === 'input' && NATIVE_ONLY_INPUT.test(text.slice(match.index, match.index + 220))) continue;
      hits.push({ ...one, line: text.slice(0, match.index).split('\n').length });
    }
  }
  return hits;
}

function bareFormsIn(text) {
  return Array.from(text.matchAll(BARE_FORM), (match) => ({
    line: text.slice(0, match.index).split('\n').length,
  }));
}

function bareAnchorsIn(text) {
  BARE_ANCHOR.lastIndex = 0;
  return Array.from(text.matchAll(BARE_ANCHOR), (match) => ({
    line: text.slice(0, match.index).split('\n').length,
  }));
}

const CLASS_TOKEN = /(^|[^-\w])\.?(wb-[a-zA-Z0-9-]+)/g;

const SOURCE_BOARD = fileURLToPath(new URL('../../../core/src/shared/styles/board.css', import.meta.url));
const SOURCE_COMPONENTS = fileURLToPath(new URL('../../../shared/src/components', import.meta.url));
const INSTALLED_BOARD = join('node_modules', '@dsh-workbench', 'core', 'dist', 'board.css');
const INSTALLED_COMPONENTS = join('node_modules', '@dsh-workbench', 'shared', 'src', 'components');

const SOURCE_SHELL_SRC = fileURLToPath(new URL('../../../core/src', import.meta.url));
const SOURCE_SHARED_SRC = fileURLToPath(new URL('../../../shared/src', import.meta.url));
const SHELL_FONT_SCALE_FILES = [
  fileURLToPath(new URL('../../../core/src/shared/styles/tokens/scale.css', import.meta.url)),
  fileURLToPath(new URL('../../../core/src/shared/styles/tokens.css', import.meta.url)),
];
const FONT_DOC = '`@dsh-workbench/core` 的 `skills/workbench-module-diy/PANEL.md` §6「字号与重点」';

function packageNameOf(dir, fallback) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return typeof manifest.name === 'string' ? manifest.name : fallback;
  } catch {
    return fallback;
  }
}

function fontRootsIn(modules) {
  const roots = [];
  for (const [dir, fallback] of [
    [SOURCE_SHELL_SRC, '@dsh-workbench/core'],
    [SOURCE_SHARED_SRC, '@dsh-workbench/shared'],
  ]) {
    if (existsSync(dir)) roots.push({ label: packageNameOf(join(dir, '..'), fallback), dir });
  }
  for (const pkg of modules) roots.push({ label: pkg.manifest.name, dir: pkg.dir });
  return roots;
}

function installedUnder(dir, tail) {
  let at = resolve(dir);
  for (;;) {
    const candidate = join(at, tail);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(at);
    if (parent === at) return undefined;
    at = parent;
  }
}

function cssFilesIn(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? cssFilesIn(full) : entry.name.endsWith('.css') ? [full] : [];
    });
  } catch {
    return [];
  }
}

function contractFilesFor(moduleDir) {
  const board = existsSync(SOURCE_BOARD) ? SOURCE_BOARD : installedUnder(moduleDir, INSTALLED_BOARD);
  const components = existsSync(SOURCE_COMPONENTS)
    ? SOURCE_COMPONENTS
    : installedUnder(moduleDir, INSTALLED_COMPONENTS);
  return [
    ...(board === undefined ? [] : [board]),
    ...(components === undefined ? [] : cssFilesIn(components)),
  ];
}

function classNamesIn(css) {
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    return [];
  }
  const names = [];
  root.walkRules((rule) => {
    for (const match of rule.selector.matchAll(/\.([A-Za-z][\w-]*)/g)) names.push(match[1]);
  });
  return names;
}

function contractOf(moduleDir) {
  const files = contractFilesFor(moduleDir);
  if (files.length === 0) return null;
  return new Set(files.flatMap((file) => classNamesIn(readFileSync(file, 'utf8'))));
}

export const title = '样式归属';

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function isTestSource(file) {
  return /(^|[\\/])__tests__[\\/]/.test(file) || /\.test\.[cm]?tsx?$/.test(file);
}

export async function run() {
  const problems = [];
  let tokenNote = null;
  const borrowed = [];
  const anchors = [];
  const controls = [];
  const rows = [];
  const actionAreas = [];
  const forms = [];

  const formRowHits = new Set();
  const actionAreaHits = new Set();
  const formHits = new Set();
  const anchorHits = new Set();
  const modules = discoverModulePackages({ root: process.cwd() });
  const contracts = new Map(modules.map((pkg) => [pkg.dir, contractOf(pkg.dir)]));
  let dshTokens = null;
  if (modules.length > 0) {
    const searched = [
      process.cwd(),
      ...modules.map((pkg) => pkg.dir),
      join(dshHome(), 'profiles'),
      join(dshHome(), 'workbench', 'diy'),
    ];
    const tokens = readTokens(searched);
    dshTokens = tokens.dsw;
    const dswNames = (tokens.dsw?.entries ?? []).map((one) => one.name);
    const wbNames = (tokens.wb?.entries ?? []).map((one) => one.name);
    const known = new Set([...dswNames, ...wbNames]);
    const versionOf = (one, label) => (one === null ? `${label}未读取到` : `${label} ${one.version ?? '版本未知'}`);
    const source = `${versionOf(tokens.dsw, 'dsh 主题')} + ${versionOf(tokens.wb, '工作台')}`;
    const hits = [];
    for (const pkg of modules) {
      for (const file of walk(pkg.dir)) {
        if (!/\.(css|ts|tsx)$/.test(file) || isTestSource(file)) continue;
        let text;
        try {
          text = readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        text.split('\n').forEach((line, index) => {
          for (const match of line.matchAll(/var\(\s*(--(?:dsw|wb)-[a-z0-9-]+)/g)) {
            hits.push({ pkg: pkg.manifest.name, file: relative(pkg.dir, file), line: index + 1, name: match[1] });
          }
        });
      }
    }
    const checkable = (hit) => (hit.name.startsWith(DSW_PREFIX) ? tokens.dsw !== null : tokens.wb !== null);
    const checked = hits.filter(checkable);
    const unchecked = hits.length - checked.length;
    const unknown = checked.filter((hit) => !known.has(hit.name));
    for (const hit of unknown) {
      const pool = hit.name.startsWith(DSW_PREFIX) ? dswNames : wbNames;
      const near = nearestTokens(hit.name, pool);
      problems.push(
        `${hit.pkg}: ${hit.file}:${hit.line} 用了 ${hit.name}，令牌清单里没有它 —— ` +
          (near.length === 0 ? '清单中没有任何相近项' : `相近项：${near.join(' / ')}`) +
          `（清单为当前读取：${source}）`,
      );
    }
    tokenNote =
      hits.length === 0
        ? null
        : unknown.length > 0
          ? `${unknown.length} 处令牌名不在当前读取的清单中（${source}）${unchecked === 0 ? '' : `；另有 ${unchecked} 处未验证（该份未读取到）`}`
          : unchecked > 0
            ? `令牌名已验证 ${checked.length} 处，均在清单中（${source}）；另有 ${unchecked} 处未验证（该份未读取到，已查找 ${searched.join('、')}）`
            : `令牌名 ${hits.length} 处均在当前读取的清单中（${source}）`;
  }
  for (const pkg of modules) {
    const contract = contracts.get(pkg.dir);
    for (const file of walk(pkg.dir)) {
      if (!/\.(css|ts|tsx)$/.test(file)) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        for (const offender of shellRulesIn(line)) {
          problems.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 定义了工作台类的 CSS 规则 —— ` +
              `${offender}（这个复合选择器里没有模块自己的类：工作台的类由渲染它的组件负责，` +
              '需要修改请与工作台维护者沟通，不要在之后覆盖它）',
          );
        }
      });

      if (/\.css$/.test(file)) {
        const key = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
        const exemptRows = FORM_ROW_EXEMPT.has(key);
        for (const hit of selfManagedRowsIn(text)) {
          formRowHits.add(key);
          if (exemptRows) continue;
          rows.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 模块自己管了行距（${hit.selector} 的 ${hit.decl}）—— ` +
              `行距归 FormRow(s)（行距只有这一档，模块不得自行编写）：` +
              `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
          );
        }
      }

      if (isTestSource(file)) continue;
      if (!/\.tsx?$/.test(file)) continue;
      const exemptControls = CONTROL_EXEMPT.has(`${pkg.manifest.name}:${relative(pkg.dir, file)}`);
      const anchorKey = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
      const exemptAnchors = ANCHOR_EXEMPT.has(anchorKey);
      for (const hit of bareAnchorsIn(text)) {
        anchorHits.add(anchorKey);
        if (exemptAnchors) continue;
        anchors.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写了裸 <a> —— ` +
            `正文中的文字链接一律使用 kit 的 Link（新窗口、noopener、自带外链小箭头；样式只有这一份）：` +
            `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
        );
      }
      if (!exemptControls) {
        for (const hit of bareControlsIn(text)) {
          controls.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写了裸 <${hit.tag}>（${hit.what}）—— ` +
              `使用 ${hit.use}（手写版本使用浏览器默认样式：悬停、禁用、焦点环、色板都需要自行实现，且不跟随主题）：` +
              `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
          );
        }
      }
      if (/\.tsx$/.test(file)) {
        const key = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
        const exemptRows = FORM_ROW_EXEMPT.has(key);
        for (const hit of handwrittenRowsIn(text)) {
          formRowHits.add(key);
          if (exemptRows) continue;
          rows.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写的「标签 + 控件」行（标签在 ${hit.labelLine} 行，控件是 ${hit.control}）—— ` +
              `使用 FormRow：标签归它（面 → 行 → 控件，中间那层归 FormRow(s)）：` +
              `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
          );
        }
      }
      const actionKey = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
      const exemptActions = FORM_ACTIONS_EXEMPT.has(actionKey);
      lines.forEach((line, index) => {
        if (!ACTION_AREA_CLASS.test(line)) return;
        actionAreaHits.add(actionKey);
        if (exemptActions) return;
        actionAreas.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 手写了操作区（借了工作台的槽类 wb-formActions）—— ` +
            `使用 kit 的 FormActions（主操作在右、一个区一个 primary、danger 紧挨其左侧且有二次确认、` +
            '间距与窄容器换行都归它）：' +
            `${line.trim().slice(0, 80)}`,
        );
      });
      const formKey = `${pkg.manifest.name}:${relative(pkg.dir, file)}`;
      const exemptForms = FORM_EXEMPT.has(formKey);
      for (const hit of bareFormsIn(text)) {
        formHits.add(formKey);
        if (exemptForms) continue;
        forms.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${hit.line} 手写了裸 <form> —— ` +
            '改用 kit 的 Form（fields 传入，其余全部归它：行的排布 / 校验时机 / 错误位置 / 提交如何被阻止 / ' +
            '第一处错误如何定位 / 操作区如何排列）：' +
            `${(lines[hit.line - 1] ?? '').trim().slice(0, 80)}`,
        );
      }
      lines.forEach((line, index) => {
        const slot = line.match(FORM_SLOT_CLASS);
        if (slot === null) return;
        formHits.add(formKey);
        if (exemptForms) return;
        forms.push(
          `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 手写了表单的行（借了工作台的槽类 ${slot[0]}）—— ` +
            '改用 kit 的 Form（面 → 行 → 控件：标签 + 控件这一行归 FormRow(s)，整张表单归 Form）：' +
            `${line.trim().slice(0, 80)}`,
        );
      });
      if (contract === null) continue;
      lines.forEach((line, index) => {
        for (const match of line.matchAll(CLASS_TOKEN)) {
          const name = match[2];
          if (line[match.index + match[0].indexOf(name) - 1] === '-') continue;
          if (name.endsWith('-')) continue;
          if (contract.has(name)) continue;
          borrowed.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 借用了 ${name}，契约里没有它 —— ${line.trim().slice(0, 100)}`,
          );
        }
      });
    }
  }

  const bindings = [];
  for (const pkg of modules) {
    const defined = new Map();
    for (const file of walk(pkg.dir)) {
      if (!/\.module\.css$/.test(file)) continue;
      const text = readFileSync(file, 'utf8').replace(/:global\([^)]*\)/g, '');
      defined.set(file, new Set(Array.from(text.matchAll(/\.([A-Za-z][\w-]*)/g), (m) => m[1])));
    }
    for (const file of walk(pkg.dir)) {
      if (!/\.tsx?$/.test(file) || isTestSource(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const hit of text.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']*\.module\.css)'/g)) {
        const bind = hit[1];
        const names = defined.get(resolve(dirname(file), hit[2]));
        if (names === undefined) continue;
        for (const use of text.matchAll(new RegExp(`\\b${bind}\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
          if (names.has(use[1])) continue;
          bindings.push(
            `${pkg.manifest.name}: ${relative(pkg.dir, file)} 用了 ${bind}.${use[1]}，` +
              `${relative(pkg.dir, resolve(dirname(file), hit[2]))} 中没有这个类`,
          );
        }
      }
    }
  }

  const present = new Set(modules.map((pkg) => pkg.manifest.name));
  const staleRows = [];
  for (const [key, reason] of FORM_ROW_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || formRowHits.has(key)) continue;
    staleRows.push(
      `${key} 仍在 FORM_ROW_EXEMPT 中，但已不再命中任何一处 —— 按棘轮删除这一行（原由：${reason}）`,
    );
  }
  const staleActionRows = [];
  for (const [key, reason] of FORM_ACTIONS_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || actionAreaHits.has(key)) continue;
    staleActionRows.push(
      `${key} 仍在 FORM_ACTIONS_EXEMPT 中，但已不再命中任何一处 —— 按棘轮删除这一行（原由：${reason}）`,
    );
  }
  const staleFormRows = [];
  for (const [key, reason] of FORM_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || formHits.has(key)) continue;
    staleFormRows.push(
      `${key} 仍在 FORM_EXEMPT 中，但已不再命中任何一处 —— 按棘轮删除这一行（原由：${reason}）`,
    );
  }
  const staleAnchorRows = [];
  for (const [key, reason] of ANCHOR_EXEMPT) {
    const owner = key.slice(0, key.indexOf(':'));
    if (!present.has(owner) || anchorHits.has(key)) continue;
    staleAnchorRows.push(
      `${key} 仍在 ANCHOR_EXEMPT 中，但已不再命中任何一处 —— 按棘轮删除这一行（原由：${reason}）`,
    );
  }

  if (bindings.length + problems.length + borrowed.length + anchors.length + controls.length
    + rows.length + actionAreas.length + forms.length + staleRows.length + staleActionRows.length
    + staleFormRows.length + staleAnchorRows.length > 0) {
    const notes = [];
    if (tokenNote !== null) notes.push(tokenNote);
    if (bindings.length > 0) {
      notes.push(
        `${bindings.length} 处是「样式绑定指向了 CSS 中不存在的类」：（CSS Modules 的哈希类名依靠"同一份文件、同一个导出"配对：` +
          '调用点得到的是 undefined，实际渲染为 class="undefined" —— 元素完全没有样式，而且控制台没有任何提示）',
      );
    }
    if (problems.length > 0) {
      notes.push(
        `${problems.length} 处是「模块不得定义工作台类（wb-*）的 CSS 规则」：（wb-* 是工作台的命名空间：` +
          '两份同名规则按注入顺序互相覆盖，用户看到的会是随机生效的那一份。判据检查**复合选择器** —— ' +
          '`:global(.wb-x)` 与 `.row :global(.wb-x)` 都算，只有同一个复合选择器中包含模块自己的类才允许）',
      );
    }
    if (borrowed.length > 0) {
      notes.push(
        `${borrowed.length} 处是「模块借用了契约中没有的 wb-* 类」：模块只允许借用工作台发布的 board.css 中存在的类。` +
          '缺少的类要么是拼写错误或改名后遗漏，要么本应进入 board.css —— 空类名在实际渲染中没有样式，而且不会产生报错。' +
          '名单是**工作台发布的那份**（`@dsh-workbench/core/dist/board.css` + 工作台组件自己的样式表）',
      );
    }
    if (anchors.length > 0) {
      notes.push(
        `${anchors.length} 处是「手写了裸 <a>」：（**正文中的文字链接**使用 kit 的 Link —— 样式只有一份，` +
          '修改一处即可全局一致；裸 <a> 使用浏览器默认样式，外观与卡片其他区域不一致。' +
          '三种不属于"绕过"的形态 —— 图标链接 / 按钮外观的链接 / 整行链接 —— 逐文件收在 `ANCHOR_EXEMPT` 中，' +
          '口径见 style.mjs 中 `BARE_ANCHOR` 那一段注释与 README 的 `style` 那一行）',
      );
    }
    if (controls.length > 0) {
      notes.push(
        `${controls.length} 处是「手写了裸 <button>/<input>/<select>」：（kit 与 dsh 原语里都有对应形态 —— ` +
          'Button / TextField / SelectField / ChoiceGroup；手写版本使用浏览器默认样式，' +
          '悬停、禁用、焦点环、字号都需要自行实现，且不跟随主题。只有多行输入 <textarea> 与 ' +
          '`type="hidden"` / `type="file"` 例外：这两种形态在两处都不存在）',
      );
    }
    if (rows.length > 0) {
      notes.push(
        `${rows.length} 处是「手写的标签+控件行 或 模块自己管的行距」：（面 → 行 → 控件，` +
          '中间那层归 `FormRow(s)`。行里自己写 `<span className=…label>` 配 `SelectField` / `TextField` / ' +
          '`ChoiceGroup` / `Input`、或给 field/form 容器设置 `gap` / 上下 `margin`，就是这一层缺少归属的信号 —— ' +
          '请换成 `<FormRow label={…}>{控件}</FormRow>`，行距一并归它。窄口径与已知漏报见 style.mjs 中那两段注释）',
      );
    }
    if (actionAreas.length > 0) {
      notes.push(
        `${actionAreas.length} 处是「手写了操作区（借了工作台的槽类 wb-formActions）」：（` +
          '操作区那一层归 `FormActions` —— 顺序（主操作在右、danger 紧挨其左侧）、一个区一个 `primary`、' +
          '间距、窄容器换行都由组件决定；调用点只提供"有哪些动作、哪个是主要、点击后做什么"。' +
          '`wb-formActions` 这个槽类只为操作区存在，出现它就说明自行排版了一套：请换成 `<FormActions actions={…} />`。' +
          '窄口径与已知漏报见 style.mjs 中那一段注释）',
      );
    }
    if (forms.length > 0) {
      notes.push(
        `${forms.length} 处是「手写了整张表单（裸 <form> 元素，或借了工作台的槽类 wb-formRow / wb-formRows / wb-field）」：（` +
          '表单那一层归 `Form` —— fields 传入，其余全部归它：行的排布、校验的时机（尚未提交时一格错误都不显示）、' +
          '错误位置、提交如何被阻止、第一处错误如何带入视口、操作区如何排列都由组件决定，调用点只提供数据与语义。' +
          '`wb-formRow` / `wb-formRows` / `wb-field` 这三个槽类只为"行 / 字段"这一层存在，出现它们就说明自行排版了一套：' +
          '改用 kit 的 `Form`（`<Form fields={…} onSubmit={…} submit={…} />`）。' +
          '窄口径与已知漏报见 style.mjs 中那一段注释）',
      );
    }
    if (staleRows.length > 0) {
      notes.push(
        `${staleRows.length} 条 FORM_ROW_EXEMPT 已不再命中：（棘轮：迁移一处删除一行 —— ` +
          '一个包迁移完 FormRow 之后，对应几行豁免要随之删除，不要保留使表格增长）',
      );
    }
    if (staleActionRows.length > 0) {
      notes.push(
        `${staleActionRows.length} 条 FORM_ACTIONS_EXEMPT 已不再命中：（棘轮：迁移一处删除一行 —— ` +
          '一个包迁移完 FormActions 之后，对应几行豁免要随之删除，不要保留使表格增长）',
      );
    }
    if (staleFormRows.length > 0) {
      notes.push(
        `${staleFormRows.length} 条 FORM_EXEMPT 已不再命中：（棘轮：迁移一处删除一行 —— ` +
          '一个包迁移完 Form 之后，对应几行豁免要随之删除，不要保留使表格增长）',
      );
    }
    if (staleAnchorRows.length > 0) {
      notes.push(
        `${staleAnchorRows.length} 条 ANCHOR_EXEMPT 已不再命中：（棘轮：迁移一处删除一行 —— ` +
          '一个文件中的裸 <a> 都迁移为 Link（或该文件已删除）之后，对应那一行豁免要随之删除，不要保留使表格增长）',
      );
    }

    return {
      status: 'fail',
      notes,
      problems: [
        ...bindings,
        ...problems,
        ...borrowed,
        ...anchors,
        ...controls,
        ...rows,
        ...actionAreas,
        ...forms,
        ...staleRows,
        ...staleActionRows,
        ...staleFormRows,
        ...staleAnchorRows,
      ],
    };
  }

  if (modules.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有样式需要检查归属'],
      problems: [],
    };
  }

  const noContract = modules
    .filter((pkg) => contracts.get(pkg.dir) === null)
    .map((pkg) => pkg.manifest.name);
  if (noContract.length === modules.length) {
    return {
      status: 'skip',
      notes: [
        '找不到工作台发布的那份契约（`@dsh-workbench/core/dist/board.css` 与 `@dsh-workbench/shared` 的组件样式表都不存在）' +
          '—— 模块借用的 wb-* 类这一项本次均未检查，不代表没有问题',
        ...(tokenNote === null ? [] : [tokenNote]),
      ],
      problems: [],
    };
  }
  const contractNote =
    noContract.length === 0
      ? '借用的类都在契约中（工作台发布的 board.css + 工作台组件自己的样式表）'
      : `${noContract.join(' / ')} 一侧找不到工作台的契约，借用这一项未检查`;
  const exemptNote =
    formRowHits.size === 0
      ? '没有手写的「标签 + 控件」行，也没有模块自行管理的行距'
      : `表单「行」这一层还有 ${formRowHits.size} 个文件在 FORM_ROW_EXEMPT 中等待工作台发版后迁移（棘轮：迁移一处删除一行）`;
  const actionNote =
    actionAreaHits.size === 0
      ? '没有手写的操作区'
      : `操作区这一层还有 ${actionAreaHits.size} 个文件在 FORM_ACTIONS_EXEMPT 中等待工作台发版后迁移（棘轮：迁移一处删除一行）`;
  const formNote =
    formHits.size === 0
      ? '没有手写的整张表单（没有裸 <form>，也没有借用表单槽类自行排列行）'
      : `表单这一层还有 ${formHits.size} 个文件在 FORM_EXEMPT 中等待工作台发版后迁移（棘轮：迁移一处删除一行）`;

  const fontScale = fontScaleOf(SHELL_FONT_SCALE_FILES, dshTokens);
  const fontNotes = fontScaleNotes(
    auditFontSizes({ roots: fontRootsIn(modules), scale: fontScale }),
    fontScale,
    { doc: FONT_DOC, dshMissing: dshTokens === null },
  );
  return {
    status: 'pass',
    notes: [
      `${modules.length} 个模块均未定义工作台前缀（wb-*）的 CSS 规则；${contractNote}；${exemptNote}；${actionNote}；${formNote}`,
      ...(tokenNote === null ? [] : [tokenNote]),
      ...fontNotes,
    ],
    problems: [],
  };
}
