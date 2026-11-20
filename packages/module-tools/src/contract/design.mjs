import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { callsProblemOf, describeRecipe, envelopePathOf, readDeclaration, recipeProblemOf, resolveRecipeOf } from '@dsh-workbench/shared/host';
import { readsOf, writesOf } from './datasource-file.mjs';
import { cardTitleFromMessages } from '../support/messages.mjs';

export const DESIGN_FILE = 'design.json';
export const DEVELOPING_FILE = 'DEVELOPING.md';
export const README_SOURCE_FILE = 'readme.json';
export const START_MARK = '<!-- dsh-wb:design:start -->';
export const END_MARK = '<!-- dsh-wb:design:end -->';

export const STATE_KEYS = ['idle', 'loading', 'ready', 'empty', 'unreadable'];
const STATE_LABELS = {
  idle: '待机（还没有选项目）',
  loading: '加载',
  ready: '就绪',
  empty: '就绪但空',
  unreadable: '读不到',
};
const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const PENDING = '（待填）';

const ROWS = {
  panel: { fields: ['cell', 'conclusion'], optional: ['link'] },
  config: {
    fields: ['persistence', 'key', 'watches', 'default', 'valuesFrom', 'wrongChoice'],
    choices: { persistence: ['prefs', 'view'] },
    mayBeEmpty: true,
  },
  capabilities: {
    fields: ['name', 'oneLine', 'shape', 'approval'],
    optional: ['approvalText'],
    mayBeEmpty: true,
  },
  linkage: { fields: ['who', 'when', 'whatChanges', 'userSees'] },
  acceptance: { fields: ['step'] },
};
const DATASOURCE_FIELDS = ['read', 'params', 'credentials', 'notLoggedIn', 'timeout'];
const WRITE_FIELDS = ['command', 'params', 'credentials', 'preview', 'readback', 'undo', 'failure'];

const SOURCE_TAGS = ['已证', '声明', '人证', '契约', '未定'];

function hasBareRequired(value) {
  let at = value.indexOf('必填');
  while (at !== -1) {
    const before = value[at - 1];
    if (before !== '非' && before !== '不') return true;
    at = value.indexOf('必填', at + 2);
  }
  return false;
}

function persistenceLabel(value) {
  const raw = text(value);
  if (raw === 'prefs') return '存起来（按工作区记，刷新还在）';
  if (raw === 'view') return '只在这次看的时候选（刷新回默认）';
  return cell(raw);
}

function recipeSummaryOf(recipe, sites) {
  try {
    const got = resolveRecipeOf(recipe, sites);
    if (!got.ok) return `（配方不合法：${got.problem.message}）`;
    const described = describeRecipe(got.value);
    const auth =
      described.auth === undefined
        ? 'cookie'
        : `${described.auth.source} → ${described.auth.place}${described.auth.name === undefined ? '' : `（${described.auth.name}）`}`;
    return `${described.method} ${described.url} · ${auth}`;
  } catch (error) {
    return `（配方不合法：${error.message}）`;
  }
}

function callsSummaryOf(recipe, calls, sites) {
  try {
    const got = resolveRecipeOf(recipe, sites);
    if (!got.ok) return `（批量不合法：${got.problem.message}）`;
    return Object.keys(calls)
      .map((name) => {
        const described = describeRecipe(got.value, calls[name]);
        return `${name}: ${described.url}`;
      })
      .join('；');
  } catch (error) {
    return `（批量不合法：${error.message}）`;
  }
}

function datasourceRowsOf(read, sites) {
  return [
    '| 项 | 值（照抄，别转述） |',
    '|---|---|',
    `| 哪条读（命令 / URL） | ${cell(read?.read)} |`,
    ...(read?.recipe === undefined ? [] : [`| 调用形状（配方） | ${cell(recipeSummaryOf(read.recipe, sites))} |`]),
    ...(read?.calls === undefined
      ? []
      : [`| 一次打几条（批量） | ${cell(callsSummaryOf(read.recipe, read.calls, sites))} |`]),
    `| 参数（缺省 / 范围 / 上限） | ${cell(read?.params)} |`,
    `| 凭据从哪来 | ${cell(read?.credentials)} |`,
    `| 没登录 / 凭据过期时是什么样 | ${cell(read?.notLoggedIn)} |`,
    `| 超时 / 连不上时是什么样 | ${cell(read?.timeout)} |`,
    `| 当初探明用的那次调用（原文） | ${soft(read?.probeCommand)} |`,
  ];
}

function writeRowsOf(write, sites) {
  return [
    '| 项 | 值（照抄，别转述） |',
    '|---|---|',
    `| 哪条写（命令 / URL + 方法） | ${cell(write?.command)} |`,
    ...(write?.recipe === undefined ? [] : [`| 调用形状（配方） | ${cell(recipeSummaryOf(write.recipe, sites))} |`]),
    `| 参数（必填 / 取值枚举 / 上限） | ${cell(write?.params)} |`,
    `| 凭据从哪来 | ${cell(write?.credentials)} |`,
    `| 有没有预览档（没有就写"没有，一次就是真的"） | ${cell(write?.preview)} |`,
    `| 写完之后怎么回读确认（哪条读 / 出参哪个字段） | ${cell(write?.readback)} |`,
    `| 配对的那个撤销 / 删除（没有就写"没有配对，一次就是真的"） | ${cell(write?.undo)} |`,
    `| 失败长什么样（含"可能已经写了"） | ${cell(write?.failure)} |`,
    `| 当初探明 / 预览用的那次调用（原文） | ${soft(write?.probeCommand)} |`,
  ];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function sitesOf(root) {
  const read = declarationReadOf(root);
  if (read === undefined || read.problems.length > 0) return undefined;
  return read.manifest?.host.sites;
}

function declarationReadOf(root) {
  const manifest = manifestOf(root);
  const raw = manifest?.dsh?.workbench;
  return raw === undefined ? undefined : readDeclaration(text(manifest?.name), raw);
}

function resolvedForDesign(recipe, sites) {
  const got = resolveRecipeOf(recipe, sites);
  return got.ok ? { recipe: got.value } : { problem: got.problem.message };
}

function envelopeOfDesign(recipe, sites) {
  if (recipe.envelope === false) return false;
  if (recipe.envelope !== undefined) return recipe.envelope;
  if (sites === undefined) return undefined;
  const site = text(recipe.site);
  return site === '' ? undefined : sites?.[site]?.envelope;
}

function recipeCellProblemsOf(label, recipe, sites, calls) {
  if (recipe === undefined || recipe === null) return [];
  const resolved = resolvedForDesign(recipe, sites);
  if (resolved.problem !== undefined) return [`${label}.recipe（${resolved.problem}）`];
  const problem = recipeProblemOf(resolved.recipe);
  if (problem !== undefined) return [`${label}.recipe（${problem}）`];
  const cells = [];
  if (recipe.envelope !== undefined) {
    const own = envelopePathOf(undefined, recipe.envelope);
    if (!own.ok) cells.push(`${label}.recipe.envelope（${own.problem}）`);
  }
  const envelope = envelopeOfDesign(recipe, sites);
  if ((resolved.recipe.response?.kind ?? 'json') === 'json') {
    const got = envelopePathOf(resolved.recipe.response?.path, envelope);
    if (!got.ok) cells.push(`${label}.recipe.response.path（${got.problem}）`);
  }
  if (calls !== undefined && calls !== null) {
    for (const [name, call] of Object.entries(calls)) {
      if ((call?.response?.kind ?? 'json') !== 'json') continue;
      const got = envelopePathOf(call?.response?.path, envelope);
      if (!got.ok) cells.push(`${label}.calls.${name}.response.path（${got.problem}）`);
    }
  }
  return cells;
}

function pending(value) {
  return text(value) === '' || text(value) === PENDING;
}

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

const SHOT_KINDS = ['card', 'approval', 'state', 'other'];

function itemTextOf(value) {
  return typeof value === 'string' ? text(value) : text(value?.text);
}

function itemListOf(value, key) {
  if (value === null || typeof value !== 'object') return [];
  const raw = value[key];
  if (Array.isArray(raw)) return raw.map(text).filter((one) => one !== '');
  const one = text(raw);
  return one === '' ? [] : [one];
}

function writeToolsOf(manifest) {
  const tools = manifest?.dsh?.workbench?.tools;
  return Array.isArray(tools) ? tools.filter((one) => one?.writes === true) : [];
}

function requiredStatesOf(design) {
  const states = asRows(design?.states);
  return ['empty', 'unreadable'].filter((key) => {
    const row = states.find((one) => text(one?.key) === key);
    return row !== undefined && text(row?.na) === '';
  });
}

export function readDesign(root) {
  const file = join(root, DESIGN_FILE);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`✖ ${DESIGN_FILE} 不是合法 JSON：${error.message}`);
    process.exit(1);
  }
}

export function acceptanceOf(root) {
  const design = readDesign(root);
  const rows = asRows(design?.acceptance);
  return {
    total: rows.length,
    checked: rows.filter((one) => one?.checked === true).length,
    acceptedAt: typeof design?.acceptedAt === 'string' ? design.acceptedAt : undefined,
  };
}

function skeleton(manifest = {}) {
  return {
    unit: text(manifest?.dsh?.workbench?.unit) || text(manifest.name).replace(/^.*\/module-/, ''),
    name: text(manifest.name),
    oneLine: text(manifest.description),
    panel: [{ cell: '', conclusion: '', link: '' }],
    states: STATE_KEYS.map((key) => ({ key, sees: '', canDo: '', agentCan: '' })),
    config: [],
    capabilities: [],
    linkage: [{ who: '', when: '', whatChanges: '', userSees: '' }],
    datasource: {
      read: '',
      params: '',
      credentials: '',
      notLoggedIn: '',
      timeout: '',
      probeCommand: '',
    },
    writes: [],
    acceptance: [{ step: '' }],
  };
}

export function writeDesign(root, value) {
  writeFileSync(join(root, DESIGN_FILE), `${JSON.stringify(value, null, 2)}\n`);
}

function need(cells, value, path) {
  if (pending(value)) cells.push(path);
}

export function emptyCells(design, sites) {
  const cells = [];
  for (const field of ['unit', 'name', 'oneLine']) need(cells, design?.[field], field);

  for (const [key, rule] of Object.entries(ROWS)) {
    const rows = asRows(design?.[key]);
    if (rows.length === 0) {
      if (rule.mayBeEmpty !== true) cells.push(`${key}（没有任何一行）`);
      continue;
    }
    rows.forEach((row, index) => {
      for (const field of rule.fields) need(cells, row?.[field], `${key}[${index}].${field}`);
      for (const [field, allowed] of Object.entries(rule.choices ?? {})) {
        const raw = text(row?.[field]);
        if (raw !== '' && !allowed.includes(raw)) {
          cells.push(`${key}[${index}].${field}（仅接受 ${allowed.join(' / ')}，收到「${raw}」）`);
        }
      }
    });
  }

  const states = asRows(design?.states);
  const noCapabilities = asRows(design?.capabilities).length === 0;
  for (const [index, key] of STATE_KEYS.entries()) {
    const row = states.find((one) => text(one?.key) === key);
    if (row === undefined) {
      cells.push(`states[${index}]（缺 ${key} 这一态）`);
      continue;
    }

    if (text(row.na) !== '') continue;
    for (const field of ['sees', 'canDo']) need(cells, row[field], `states.${key}.${field}`);

    if (!noCapabilities) need(cells, row.agentCan, `states.${key}.agentCan`);
  }

  const reads = readsOf(design);
  if (reads.length === 0) cells.push('数据源（未编写任何一条读：datasource 或 reads 至少需要一条）');
  reads.forEach((read, index) => {
    const label = reads.length === 1 ? 'datasource' : `reads[${index}]`;
    for (const field of DATASOURCE_FIELDS) need(cells, read?.[field], `${label}.${field}`);

    const recipe = read?.recipe;
    const custom = read?.custom;
    if (recipe !== undefined && custom !== undefined) {
      cells.push(`${label}.recipe（recipe 与 custom 只能选择其中一个）`);
    }
    if (recipe !== undefined) cells.push(...recipeCellProblemsOf(label, recipe, sites, read?.calls));
    if (read?.calls !== undefined) {
      if (recipe === undefined) cells.push(`${label}.calls（calls 要有 recipe）`);
      else {
        const resolved = resolvedForDesign(recipe, sites);
        if (resolved.problem !== undefined) cells.push(`${label}.calls（${resolved.problem}）`);
        else {
          const problem = callsProblemOf(resolved.recipe, read.calls);
          if (problem !== undefined) cells.push(`${label}.calls（${problem}）`);
        }
      }
    }
    if (custom !== undefined && text(custom?.why) === '') cells.push(`${label}.custom.why`);

    const key = text(read?.key);
    if (key !== '' && !/^[a-z][A-Za-z0-9]*$/.test(key)) cells.push(`${label}.key（lowerCamelCase）`);
  });

  const writes = writesOf(design);
  writes.forEach((write, index) => {
    const label = writes.length === 1 ? 'write' : `writes[${index}]`;
    for (const field of WRITE_FIELDS) need(cells, write?.[field], `${label}.${field}`);

    const params = text(write?.params);
    if (!pending(params) && hasBareRequired(params) && !SOURCE_TAGS.some((tag) => params.includes(tag))) {
      cells.push(`${label}.params.source`);
    }

    const recipe = write?.recipe;
    const custom = write?.custom;
    if (recipe !== undefined && custom !== undefined) {
      cells.push(`${label}.recipe（recipe 与 custom 只能选择其中一个）`);
    }
    if (recipe !== undefined) cells.push(...recipeCellProblemsOf(label, recipe, sites, undefined));
    if (custom !== undefined && text(custom?.why) === '') cells.push(`${label}.custom.why`);

    const key = text(write?.key);
    if (key !== '' && !/^[a-z][A-Za-z0-9]*$/.test(key)) cells.push(`${label}.key（lowerCamelCase）`);
  });

  const keys = new Set();
  const seen = new Map();
  for (const [readIndex, read] of reads.entries()) {
    const key = text(read?.key);
    if (key === '') continue;
    if (keys.has(key)) cells.push(`数据源 key 重复：${key}（${seen.get(key)} 与 读 ${String(readIndex + 1)}）`);
    else seen.set(key, `读 ${String(readIndex + 1)}`);
    keys.add(key);
  }
  for (const [writeIndex, write] of writes.entries()) {
    const key = text(write?.key);
    if (key === '') continue;
    if (keys.has(key)) cells.push(`数据源 key 重复：${key}（${seen.get(key)} 与 写 ${String(writeIndex + 1)}）`);
    else seen.set(key, `写 ${String(writeIndex + 1)}`);
    keys.add(key);
  }

  return cells;
}

function cell(value) {
  const raw = text(value);
  return raw === '' ? PENDING : raw.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

function soft(value) {
  const raw = text(value);
  return raw === '' || raw === PENDING ? '—' : cell(raw);
}

function tableOf(header, rows) {
  const columns = header.split(' | ');
  const divider = `|${columns.map(() => '---').join('|')}|`;
  return [`| ${header} |`, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

export function designWarningsOf(design) {
  const reads = readsOf(design);
  const writes = writesOf(design);
  const warnings = [];
  reads.forEach((read, index) => {
    if (read?.custom === undefined) return;
    const label = reads.length === 1 ? 'datasource' : `reads[${index}]`;
    const why = text(read.custom?.why);
    warnings.push(`${label}.custom（${why === '' ? '未写 why' : why}）—— 配方无法覆盖的读，理由需要保留在设计记录中`);
  });
  writes.forEach((write, index) => {
    if (write?.custom === undefined) return;
    const label = writes.length === 1 ? 'write' : `writes[${index}]`;
    const why = text(write.custom?.why);
    warnings.push(`${label}.custom（${why === '' ? '未写 why' : why}）—— 配方无法覆盖的写，理由需要保留在设计记录中`);
  });
  return warnings;
}

export function renderDesign(design, sites) {
  const panel = asRows(design?.panel);
  const config = asRows(design?.config);
  const capabilities = asRows(design?.capabilities);
  const linkage = asRows(design?.linkage);
  const acceptance = asRows(design?.acceptance);
  const states = asRows(design?.states);
  const reads = readsOf(design);
  const writes = writesOf(design);

  const stateRows = STATE_KEYS.map((key, index) => {
    const row = states.find((one) => text(one?.key) === key) ?? {};
    const na = text(row.na);
    if (na !== '') {
      return [LETTERS[index], STATE_LABELS[key], `（这份模块不适用）${na}`, '—', '—'];
    }
    return [
      LETTERS[index],
      STATE_LABELS[key],
      cell(row.sees),
      cell(row.canDo),
      capabilities.length === 0 ? soft(row.agentCan) : cell(row.agentCan),
    ];
  });

  const acceptanceRows =
    acceptance.length === 0
      ? ['- [ ] （待填）']
      : acceptance.map((one) => `- [${one?.checked === true ? 'x' : ' '}] ${cell(one?.step)}`);

  return [
    '### 表 1 面板：用户看什么、能自己配置什么',
    '',
    tableOf('这一格 | 一眼能得出什么结论 | 点击后打开哪里', panel.length === 0
      ? [['（待填）', PENDING, PENDING]]
      : panel.map((one) => [cell(one?.cell), cell(one?.conclusion), soft(one?.link)])),
    '',
    tableOf(
      '保存方式（刷新后是否保留） | 可配置项 | 作用 | 默认值 | 可选值来源 | 选错后的表现',
      config.length === 0 ? [['（没有可配项）', '—', '—', '—', '—', '—']] : config.map((one) => [
        persistenceLabel(one?.persistence),
        cell(one?.key),
        cell(one?.watches),
        cell(one?.default),
        cell(one?.valuesFrom),
        cell(one?.wrongChoice),
      ]),
    ),
    '',
    '状态矩阵（每种状态：用户看到什么 / 用户能做什么 / agent 能继续做什么）——',
    '图号对应「卡片如何呈现五种状态」那一节：',
    '',
    tableOf('# | 状态 | 用户看到什么 | 用户能做什么 | agent 能继续做什么', stateRows),
    '',
    '### 表 2 agent：能做什么、哪些需要批准',
    '',
    tableOf(
      '能力 | 一句话 | 传入什么 / 返回什么（附真实调用与返回） | 需要批准吗 | 批准时用户看到的"会发生什么"',
      capabilities.length === 0
        ? [['（这份模块故意没有能力）', '—', '—', '—', '—']]
        : capabilities.map((one) => [
            cell(one?.name),
            cell(one?.oneLine),
            cell(one?.shape),
            cell(one?.approval),
            soft(one?.approvalText),
          ]),
    ),
    '',
    '### 表 3 联动：agent 操作后，这个模块哪一个面板格会变化',
    '',
    tableOf('谁在操作 | 面板什么时候变化 | 哪一个面板格变化（投影 + 最窄参数） | 用户看到什么', linkage.length === 0
      ? [['（待填）', PENDING, PENDING, PENDING]]
      : linkage.map((one) => [cell(one?.who), cell(one?.when), cell(one?.whatChanges), cell(one?.userSees)])),
    '',
    '### 数据源探明记录',
    '',
    ...(reads.length <= 1
      ? [...datasourceRowsOf(reads[0], sites), '']
      : reads.flatMap((one, index) => [`#### 读 ${String(index + 1)}`, '', ...datasourceRowsOf(one, sites), ''])),
    ...(writes.length === 0
      ? []
      : [
          '### 写通道探明记录',
          '',
          ...(writes.length <= 1
            ? [...writeRowsOf(writes[0], sites), '']
            : writes.flatMap((one, index) => [`#### 写 ${String(index + 1)}`, '', ...writeRowsOf(one, sites), ''])),
        ]),
    '### 验收（在真实卡片上逐条验证后勾选：`dsh-wb-module design accept`）',
    '',
    ...acceptanceRows,
    '',
    `> 这一段由 \`${DESIGN_FILE}\` 生成（\`dsh-wb-module design render\`），不要手动修改。`,
  ].join('\n');
}

function bodyLinesOf(value) {
  if (Array.isArray(value)) {
    return value.flatMap((one) => {
      const line = itemTextOf(one);
      return line === '' ? [] : [`- ${line}`];
    });
  }
  const line = text(value);
  return line === '' ? [] : [line];
}

function sectionOf(heading, value) {
  const lines = bodyLinesOf(value);
  return lines.length === 0 ? [] : [`## ${heading}`, '', ...lines, ''];
}

function shotsOf(source) {
  const listed = Array.isArray(source?.shots) ? source.shots : [];
  const single = text(source?.ascii) === '' ? [] : [{ caption: '', ascii: source.ascii }];
  return [...single, ...listed].flatMap((one) => {
    const drawing = typeof one?.ascii === 'string' ? one.ascii.replace(/\s+$/, '') : '';
    if (drawing.trim() === '') return [];
    return [{ caption: text(one?.caption), kind: text(one?.kind), drawing }];
  });
}

export function renderUserReadme(source) {
  const title = text(source?.title) || '模块';
  const summary = text(source?.summary);
  const faq = asRows(source?.faq);
  const install = text(source?.install) === ''
    ? '在市场「已安装」里安装或卸载。安装后，在当前项目的面板里勾选这个模块才会显示；卸载后模块从面板里移除。'
    : source?.install;
  const shots = shotsOf(source);
  const shotsHeading = text(source?.shotsTitle) || '长这样';
  const shotLines = shots.length === 0
    ? []
    : [
        `## ${shotsHeading}`,
        '',
        ...shots.flatMap((one) => [
          ...(one.caption === '' ? [] : [`**${one.caption}**`, '']),
          '```',
          one.drawing,
          '```',
          '',
        ]),
      ];
  const faqLines = faq.length === 0
    ? []
    : [
        '## 常见问题',
        '',
        ...faq.flatMap((one) => [`### ${text(one?.q)}`, '', text(one?.a), '']),
      ];

  return [
    `# ${title}`,
    '',
    summary,
    '',
    ...shotLines,
    ...sectionOf('你会看到什么', source?.see),
    ...sectionOf('你能做什么', source?.do),
    ...sectionOf('agent 能做什么', source?.agent),
    ...sectionOf('数据从哪来', source?.data),
    ...sectionOf('装和卸', install),
    ...sectionOf('出问题先看', source?.trouble),
    ...faqLines,
  ].join('\n');
}

export function readUserSource(root) {
  const file = join(root, README_SOURCE_FILE);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch (error) {
    console.error(`✖ ${README_SOURCE_FILE} 不是合法 JSON：${error.message}`);
    process.exit(1);
  }
}

export function writeUserSource(root, value) {
  writeFileSync(join(root, README_SOURCE_FILE), `${JSON.stringify(value, null, 2)}\n`);
}

function manifestTitleOf(manifest) {
  const title = manifest?.dsh?.workbench?.title;
  if (typeof title === 'string' && title.trim() !== '') return title.trim();
  if (title !== null && typeof title === 'object') {
    const zh = text(title.zh);
    if (zh !== '') return zh;
    const en = text(title.en);
    if (en !== '') return en;
  }
  return text(manifest?.name);
}

export function userSourceSkeleton(manifest, design, root) {
  const capabilities = asRows(design?.capabilities)
    .map((one) => text(one?.name))
    .filter((one) => one !== '');
  const configs = asRows(design?.config)
    .map((one) => text(one?.key))
    .filter((one) => one !== '');
  const unit = text(manifest?.dsh?.workbench?.unit);
  const cardTitle = root === undefined || unit === '' ? undefined : cardTitleFromMessages(root, unit);
  const shots = [
    {
      kind: 'card',
      caption: '卡片',
      ascii: '（待填：一张卡片布局草图，用界面真实文案，按屏幕从上到下的顺序画）',
    },
  ];
  if (writeToolsOf(manifest).length > 0) {
    shots.push({
      kind: 'approval',
      caption: '审批',
      ascii: '（待填：审批屏，用真实标题、明细与按钮画）',
    });
  }
  return {
    title: text(cardTitle?.zh) || manifestTitleOf(manifest) || text(design?.name) || '模块',
    summary: text(design?.oneLine) || text(manifest?.description),
    shotsTitle: '',
    shots,
    see: [
      '（待填：模块顶部显示什么）',
      '（待填：中间显示什么）',
      '（待填：下半部分有哪几块）',
    ],
    do: [
      ...configs.map((key) => ({
        config: key,
        text: '（待填：这一项设置改什么、按什么存、影响什么）',
      })),
      '（待填：用户能点击的一个按钮，点击后发生什么）',
      '（待填：用户还能做的另一件事）',
    ],
    agent: capabilities.length === 0
      ? ['（待填：agent 能替用户做的一件事；执行前要不要批准）']
      : capabilities.map((name) => ({
          capabilities: [name],
          text: '（待填：agent 能替用户做什么；执行前要不要批准）',
        })),
    data: [
      '（待填：读什么、在哪读、要不要登录）',
      '（待填：写什么、存在哪、会不会写进项目）',
      '（待填：卸载后这些数据还在不在）',
    ],
    install: '',
    trouble: [
      ...(requiredStatesOf(design).length === 0
        ? []
        : [{ states: requiredStatesOf(design), text: '（待填：空态或读不到时，用户看到什么、下一步做什么）' }]),
      '（待填：卡片没出现时先看什么）',
    ],
    faq: [],
  };
}

const USER_COPY_FIELDS = ['title', 'summary', 'see', 'do', 'agent', 'data', 'trouble'];
const USER_COPY_FORBIDDEN = [
  ['反引号 / 代码片段', /`/],
  ['代码块', /```/],
  ['源码路径', /\bsrc\//],
  ['设计记录文件名', /\bdesign\.json\b/],
  ['文案记录文件名', /\breadme\.json\b/],
  ['工具链命令', /\bdsh-wb-module\b/],
  ['运行时名', /\bopencli\b/],
  ['内部错误码', /\bauth-required\b|\bcli-[a-z-]+\b/],
  ['客户端实现名', /\bapproval\.render\b/],
  ['平台内部字段', /\bglobal_key\b/],
];

const BULLET_LIMIT = 70;

function copyTextsOf(value) {
  if (Array.isArray(value)) return value.map(itemTextOf).filter((one) => one !== '');
  const one = text(value);
  return one === '' ? [] : [one];
}

function coverageOf(problems, items, options) {
  const covered = new Set();
  for (const [index, one] of items.entries()) {
    for (const name of itemListOf(one, options.field)) {
      if (!options.allowed.has(name)) {
        problems.push(`${options.where}[${index}] 绑定了不存在的${options.noun}「${name}」—— ${options.hint}`);
      } else if (options.required.has(name)) {
        covered.add(name);
      }
    }
  }
  for (const name of options.required) {
    if (!covered.has(name)) {
      problems.push(
        `${options.noun}「${name}」没有${options.missing ?? '用户文案'} —— 请在 ${README_SOURCE_FILE} 的 ${options.where}[] 中提供一条绑定它的条目`,
      );
    }
  }
}

function coverageProblemsOf(source, design, manifest) {
  const problems = [];
  const capabilities = new Set(
    asRows(design?.capabilities)
      .map((one) => text(one?.name))
      .filter((one) => one !== ''),
  );
  coverageOf(problems, asRows(source?.agent), {
    where: 'agent',
    field: 'capabilities',
    allowed: capabilities,
    required: capabilities,
    noun: '能力',
    hint: `对一下 ${DESIGN_FILE} 的 capabilities[].name`,
  });
  const configs = new Set(
    asRows(design?.config)
      .map((one) => text(one?.key))
      .filter((one) => one !== ''),
  );
  coverageOf(problems, asRows(source?.do), {
    where: 'do',
    field: 'config',
    allowed: configs,
    required: configs,
    noun: '设置',
    hint: `对一下 ${DESIGN_FILE} 的 config[].key`,
  });
  coverageOf(problems, asRows(source?.trouble), {
    where: 'trouble',
    field: 'states',
    allowed: new Set(STATE_KEYS),
    required: new Set(requiredStatesOf(design)),
    noun: '状态',
    hint: `仅接受 ${STATE_KEYS.join(' / ')}`,
    missing: '排障文案',
  });

  const shots = shotsOf(source);
  for (const [index, one] of shots.entries()) {
    if (one.kind !== '' && !SHOT_KINDS.includes(one.kind)) {
      problems.push(`shots[${index}].kind 仅接受 ${SHOT_KINDS.join(' / ')}，收到「${one.kind}」`);
    }
  }
  const writes = writeToolsOf(manifest);
  const approvalShots = shots.filter(
    (one) => one.kind === 'approval' || (one.kind === '' && one.caption.includes('审批')),
  );
  if (writes.length > 0 && approvalShots.length === 0) {
    const names = writes.map((one) => text(one?.name)).filter((one) => one !== '').join(' / ');
    problems.push(
      `有写工具（${names}）却没有审批图 —— 请在 shots[] 中添加一张 kind: "approval" 的图，按真实审批屏绘制`,
    );
  }
  if (writes.length === 0 && approvalShots.length > 0) {
    problems.push('没有写工具，却有审批图 —— 审批屏不会出现；请删除它，或改成其他 kind');
  }
  return problems;
}

export function userCopyProblemsOf(source, design, manifest, options = {}) {
  const problems = [];
  if (source === undefined) return [`没有 ${README_SOURCE_FILE} —— 请先运行 dsh-wb-module design init 或 design migrate`];
  const expectedTitle = text(options.expectedTitle);
  if (expectedTitle !== '' && text(source?.title) !== expectedTitle) {
    problems.push(
      `title 是「${text(source?.title)}」—— 用户在面板与市场中看到的模块名是「${expectedTitle}」；两处应使用同一个名称`,
    );
  }
  for (const field of USER_COPY_FIELDS) {
    const values = copyTextsOf(source?.[field]);
    if (values.length === 0) problems.push(`${field} 为空 —— README 的「${field}」还没有用户文案`);
    for (const value of values) {
      if (value.includes('（待填')) problems.push(`${field} 仍保留「（待填）」`);
      if (Array.isArray(source?.[field]) && value.length > BULLET_LIMIT) {
        problems.push(`${field} 有一条 ${String(value.length)} 字 —— 超过 ${String(BULLET_LIMIT)} 字应拆成两条，或将细节放入图中`);
      }
    }
  }
  for (const field of ['see', 'do', 'agent', 'data', 'trouble']) {
    const value = source?.[field];
    if (!Array.isArray(value)) {
      problems.push(`${field} 必须是条目数组`);
      continue;
    }
    for (const [index, one] of value.entries()) {
      if (itemTextOf(one) === '') problems.push(`${field}[${index}] 为空`);
    }
  }
  const shots = asRows(source?.shots);
  if (shots.length === 0) problems.push('shots 为空 —— 至少绘制一张卡片布局图');
  for (const [index, one] of shots.entries()) {
    if (text(one?.ascii).includes('（待填')) problems.push(`shots[${index}] 仍保留「（待填）」`);
  }
  for (const field of ['title', 'summary', 'see', 'do', 'agent', 'data', 'install', 'trouble']) {
    for (const value of copyTextsOf(source?.[field])) {
      for (const [label, pattern] of USER_COPY_FORBIDDEN) {
        if (pattern.test(value)) problems.push(`${field} 里有${label} —— 该段仅面向终端用户`);
      }
    }
  }
  for (const [index, one] of asRows(source?.faq).entries()) {
    if (text(one?.q) === '') problems.push(`faq[${index}].q 为空`);
    if (text(one?.a) === '') problems.push(`faq[${index}].a 为空`);
    if (text(one?.q).includes('（待填') || text(one?.a).includes('（待填')) {
      problems.push(`faq[${index}] 仍保留「（待填）」`);
    }
    for (const [label, pattern] of USER_COPY_FORBIDDEN) {
      if (pattern.test(text(one?.q)) || pattern.test(text(one?.a))) {
        problems.push(`faq[${index}] 里有${label} —— 该段仅面向终端用户`);
      }
    }
  }
  if (design !== undefined) problems.push(...coverageProblemsOf(source, design, manifest));
  return problems;
}

function regionOf(readme) {
  const start = readme.indexOf(START_MARK);
  const end = readme.indexOf(END_MARK);
  if (start === -1 || end === -1 || end < start) return undefined;
  return { start, end };
}

export function applyToDeveloping(root, markdown) {
  const file = join(root, DEVELOPING_FILE);
  const block = `${START_MARK}\n${markdown}\n${END_MARK}`;
  if (!existsSync(file)) {
    writeFileSync(file, `# ${text(manifestOf(root).name) || '模块'} · 作者文档\n\n${block}\n`);
    return 'created';
  }
  const text0 = readFileSync(file, 'utf8');
  const at = regionOf(text0);
  if (at !== undefined) {
    const next = `${text0.slice(0, at.start)}${block}${text0.slice(at.end + END_MARK.length)}`;
    if (next === text0) return 'same';
    writeFileSync(file, next);
    return 'updated';
  }
  const heading = text0.indexOf('## 需求底稿');
  const insertAt = (() => {
    if (heading === -1) return text0.length;
    const after = text0.indexOf('\n## ', heading + 1);
    return after === -1 ? text0.length : after + 1;
  })();
  const before = text0.slice(0, insertAt).replace(/\s*$/, '');
  const after = text0.slice(insertAt);
  writeFileSync(file, `${before}\n\n${block}\n${after === '' ? '' : `\n${after}`}`);
  return 'inserted';
}

export function writeUserReadme(root, source) {
  const file = join(root, 'README.md');
  const next = renderUserReadme(source);
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (before === next) return 'same';
  writeFileSync(file, next);
  return before === '' ? 'created' : 'updated';
}

function manifestOf(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function checkDesign(root) {
  const design = readDesign(root);
  if (design === undefined) {
    console.error(`✖ 没有 ${DESIGN_FILE} —— 请先运行 dsh-wb-module design init`);
    process.exit(1);
  }
  const sites = sitesOf(root);
  const manifest = manifestOf(root);
  const unit = text(manifest?.dsh?.workbench?.unit);
  const cardTitle = unit === '' ? undefined : cardTitleFromMessages(root, unit);
  const expectedTitle = text(cardTitle?.zh) || manifestTitleOf(manifest);
  const cells = emptyCells(design, sites);
  const declaration = declarationReadOf(root);
  if (declaration !== undefined && declaration.problems.length > 0) {
    cells.unshift(`清单 dsh.workbench（${declaration.problems[0]}）`);
  }
  const warnings = designWarningsOf(design);
  const rows = (key) => asRows(design[key]).length;
  const acceptance = asRows(design.acceptance);
  const accepted = acceptance.filter((one) => one?.checked === true).length;

  const developing = existsSync(join(root, DEVELOPING_FILE)) ? readFileSync(join(root, DEVELOPING_FILE), 'utf8') : '';
  const at = regionOf(developing);
  const fresh = at === undefined ? false : developing.slice(at.start, at.end) === `${START_MARK}\n${renderDesign(design, sites)}\n`;
  const source = readUserSource(root);
  const copyProblems = userCopyProblemsOf(source, design, manifest, { expectedTitle });
  const user = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : '';
  const userFresh = source !== undefined && user === renderUserReadme(source);

  console.log(`design.json：面板 ${rows('panel')} 行 · 状态 ${STATE_KEYS.length} 态 · 配置 ${rows('config')} 项 · 能力 ${rows('capabilities')} 条 · 联动 ${rows('linkage')} 行 · 验收 ${accepted}/${acceptance.length}`);
  for (const one of warnings) console.log(`⚠ ${one}`);
  if (cells.length > 0) {
    console.error(`✖ 还空着 ${cells.length} 格（"空着的格就是尚未确定的事"，不要带着空白继续）：`);
    for (const one of cells) console.error(`  · ${one}`);
  }
  if (developing === '') {
    console.error(`✖ 没有 ${DEVELOPING_FILE} —— 旧模块请先运行 dsh-wb-module design migrate；新模块请运行 design init`);
  } else if (!fresh) {
    console.error(`✖ ${DEVELOPING_FILE} 里那一段落后于 design.json（或缺少标记）—— 请运行 dsh-wb-module design render`);
  }
  if (copyProblems.length > 0) {
    console.error(`✖ ${README_SOURCE_FILE} 尚不能生成终端用户 README：`);
    for (const one of copyProblems) console.error(`  · ${one}`);
  }
  if (!userFresh) {
    console.error(`✖ README.md 落后于 ${README_SOURCE_FILE}（或尚未生成用户说明）—— 请运行 dsh-wb-module design render`);
  }
  if (cells.length === 0 && fresh && copyProblems.length === 0 && userFresh) {
    console.log(`✔ 三张表已填写完整，README 与 ${DEVELOPING_FILE} 均为最新${accepted === acceptance.length ? '，验收也已勾选完成' : `；验收还差 ${acceptance.length - accepted} 条（请在真实卡片上逐条验证后运行 design accept）`}`);
  }
  process.exit(cells.length === 0 && fresh && copyProblems.length === 0 && userFresh ? 0 : 1);
}

export async function design({ root, args = [] }) {
  const action = args[0] ?? 'check';

  if (action === 'init') {
    if (existsSync(join(root, DESIGN_FILE))) {
      console.error(`✖ ${DESIGN_FILE} 已存在；如需重新生成，请先删除它`);
      process.exit(1);
    }
    const manifest = manifestOf(root);
    const design0 = skeleton(manifest);
    writeDesign(root, design0);
    const source = readUserSource(root) ?? userSourceSkeleton(manifest, design0, root);
    writeUserSource(root, source);
    const how = applyToDeveloping(root, renderDesign(design0, sitesOf(root) ?? undefined));
    writeUserReadme(root, source);
    console.log(`✔ 已写入 ${DESIGN_FILE} 与 ${README_SOURCE_FILE}（工程设计记录 + 用户文案骨架）`);
    console.log(`  ${DEVELOPING_FILE} 的那一段：${how === 'created' ? '新建' : how === 'inserted' ? '插入「需求底稿」一节' : '已更新'}`);
    console.log('  接下来将两边的空白填成"用户可见的内容"，然后运行 dsh-wb-module design check');
    return;
  }

  if (action === 'render') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 请先运行 dsh-wb-module design init`);
      process.exit(1);
    }
    if (!existsSync(join(root, DEVELOPING_FILE))) {
      console.error(`✖ 没有 ${DEVELOPING_FILE} —— 旧模块请先运行 dsh-wb-module design migrate；新模块请运行 design init`);
      process.exit(1);
    }
    const source = readUserSource(root);
    if (source === undefined) {
      console.error(`✖ 没有 ${README_SOURCE_FILE} —— 旧模块请先运行 dsh-wb-module design migrate；新模块请运行 design init`);
      process.exit(1);
    }
    const how = applyToDeveloping(root, renderDesign(design0, sitesOf(root) ?? undefined));
    const user = writeUserReadme(root, source);
    console.log(`✔ ${DEVELOPING_FILE} 的那一段：${how === 'same' ? '已是最新' : how === 'updated' ? '已更新' : how === 'inserted' ? '插入「需求底稿」一节' : '已更新'}`);
    console.log(`  README.md：${user === 'same' ? '已是最新' : user === 'created' ? '新建' : '重新生成'}`);
    return;
  }

  if (action === 'accept') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 请先运行 dsh-wb-module design init`);
      process.exit(1);
    }
    const acceptance = asRows(design0.acceptance);
    if (acceptance.length === 0) {
      console.error('✖ 验收清单为空 —— 请先写清"打开哪 → 看什么 → 点击什么 → 应看到什么"');
      process.exit(1);
    }
    design0.acceptance = acceptance.map((one) => ({ ...one, checked: true }));
    design0.acceptedAt = new Date().toISOString();
    writeDesign(root, design0);
    applyToDeveloping(root, renderDesign(design0, sitesOf(root) ?? undefined));
    const source = readUserSource(root);
    if (source !== undefined) writeUserReadme(root, source);
    console.log(`✔ ${acceptance.length} 条验收已全部勾选（仅在实际于真实卡片上逐条验证后再运行此命令）`);
    return;
  }

  if (action === 'migrate') {
    const design0 = readDesign(root);
    if (design0 === undefined) {
      console.error(`✖ 没有 ${DESIGN_FILE} —— 请先运行 dsh-wb-module design init`);
      process.exit(1);
    }
    if (existsSync(join(root, DEVELOPING_FILE))) {
      console.error(`✖ ${DEVELOPING_FILE} 已存在；拆分过的模块无需再运行 migrate`);
      process.exit(1);
    }
    const readmeFile = join(root, 'README.md');
    if (existsSync(readmeFile)) {
      copyFileSync(readmeFile, join(root, DEVELOPING_FILE));
      console.log(`✔ 旧 README 已保存为 ${DEVELOPING_FILE}`);
    }
    const source = readUserSource(root) ?? userSourceSkeleton(manifestOf(root), design0, root);
    writeUserSource(root, source);
    const how = applyToDeveloping(root, renderDesign(design0, sitesOf(root) ?? undefined));
    const user = writeUserReadme(root, source);
    console.log(`✔ ${DEVELOPING_FILE} 的那一段：${how === 'same' ? '本来就是最新的' : how === 'updated' ? '更新了' : '已更新'}`);
    console.log(`✔ ${README_SOURCE_FILE} 与 README.md 已生成（${user === 'created' ? '新建' : '重新生成'}）`);
    console.log(`  接下来将 ${README_SOURCE_FILE} 中的（待填）按终端用户视角填写完整，再运行 dsh-wb-module design check`);
    return;
  }

  if (action === 'check') {
    checkDesign(root);
    return;
  }

  console.error(`无法识别的 design 动作：${action}（可用：init / migrate / check / render / accept）`);
  process.exit(2);
}
