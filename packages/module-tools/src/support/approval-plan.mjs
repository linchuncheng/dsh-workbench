function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export const HEAD_BUDGETS = { detail: 20, question: 40, fallback: 40, headline: 15 };

export const APPROVAL_PLAN_LINES_MAX = 6;

const EN_RATIO = 3;

const PLAN_FIELDS = [
  ['object', '修改项', false],
  ['change', '修改后', true],
  ['target', '目标位置', false],
  ['impact', '影响范围', true],
];

const PLAN_BAD = /undefined|NaN|\[object Object\]/;

function isPlanLines(value) {
  return typeof value === 'string' || (Array.isArray(value) && value.every((one) => typeof one === 'string'));
}

function planLinesOf(value) {
  return typeof value === 'string' ? [value] : value;
}

function planValueProblems(name, toolName, label, value, many, missing) {
  const problems = [];
  if (!isPlanLines(value)) {
    return [
      `${name}: 写工具 ${toolName} 的 approval.plan 的「${label}」必须是字符串或字符串数组 —— ` +
        (many ? '多条事实用数组，每一项一行' : '这里是单值，多个目标放 extra 或 render'),
    ];
  }
  if (!many && Array.isArray(value)) {
    return [
      `${name}: 写工具 ${toolName} 的 approval.plan 的「${label}」只收单行字符串 —— ` +
        '多个目标或对象放 extra 或 render',
    ];
  }
  const lines = planLinesOf(value).map((one) => one.trim());
  if (lines.length === 0 || lines.every((one) => one === '')) {
    problems.push(`${name}: 写工具 ${toolName} 的 approval.plan ${missing}`);
    return problems;
  }
  if (lines.some((one) => one === '')) {
    problems.push(
      `${name}: 写工具 ${toolName} 的 approval.plan 的「${label}」里有空行 —— ` +
        '数组里每一项都要有内容',
    );
  }
  if (many && lines.length > APPROVAL_PLAN_LINES_MAX) {
    problems.push(
      `${name}: 写工具 ${toolName} 的 approval.plan 的「${label}」有 ${lines.length} 行 —— ` +
        `最多 ${APPROVAL_PLAN_LINES_MAX} 行；更多内容放 approval.render`,
    );
  }
  for (const line of lines) {
    if (line === '') continue;
    if (/[\r\n]/.test(line)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 approval.plan 的「${label}」里有换行 —— ` +
          '每一项要单行；换行请拆成多个数组元素',
      );
      continue;
    }
    if (PLAN_BAD.test(line) || /^(待填|TODO|TBD)$/i.test(line)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 approval.plan 的「${label}」是占位或调试值：「${line}」—— ` +
          '审批屏上不能出现待填、undefined、NaN 或 [object Object]',
      );
    }
  }
  return problems;
}

function planProblemsOf(name, toolName, plan) {
  if (plan === null || plan === undefined) {
    return [
      `${name}: 写工具 ${toolName} 的 approval.plan 在合成调用上返回了空值 —— ` +
        '四行事实说不清时就不要发起审批：让 needsApproval 返回 { kind: \'deny\', reason }，而不是让审批屏画空白',
    ];
  }
  if (typeof plan !== 'object' || Array.isArray(plan)) {
    return [
      `${name}: 写工具 ${toolName} 的 approval.plan 返回的不是对象 —— ` +
        '应返回 { object, change, target, impact }（可带 objectLabel / extra / warn）',
    ];
  }
  const problems = [];
  for (const [field, label, many] of PLAN_FIELDS) {
    problems.push(
      ...planValueProblems(
        name,
        toolName,
        label,
        plan[field],
        many,
        `缺少「${label}」—— 四行是审批详情的下限：对象、修改后、目标位置、影响范围都要说清`,
      ),
    );
  }
  if (plan.objectLabel !== undefined) {
    const label = typeof plan.objectLabel === 'string' ? plan.objectLabel.trim() : '';
    if (label === '' || /[\r\n]/.test(label)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 approval.plan.objectLabel 必须是一行非空文字（例如「缺陷」「文件」）`,
      );
    }
  }
  if (plan.extra !== undefined) {
    if (!Array.isArray(plan.extra)) {
      problems.push(`${name}: 写工具 ${toolName} 的 approval.plan.extra 必须是数组`);
    } else {
      plan.extra.forEach((row, index) => {
        const label = typeof row?.label === 'string' ? row.label.trim() : '';
        if (label === '' || /[\r\n]/.test(label)) {
          problems.push(
            `${name}: 写工具 ${toolName} 的 approval.plan.extra[${index}] 的标签不能为空，且必须单行`,
          );
        }
        if (row?.value === undefined) {
          problems.push(
            `${name}: 写工具 ${toolName} 的 approval.plan.extra[${index}] 的标签和值都不能为空 —— ` +
              '附加行也要说清是什么、值是什么',
          );
        } else {
          problems.push(
            ...planValueProblems(
              name,
              toolName,
              `extra[${index}].value`,
              row.value,
              true,
              `缺少「extra[${index}].value」—— 附加行也要说清值是什么`,
            ),
          );
        }
      });
    }
  }
  if (plan.warn !== undefined) {
    problems.push(
      ...planValueProblems(
        name,
        toolName,
        '警告 warn',
        plan.warn,
        true,
        '缺少「警告 warn」—— 没有内容就不要给 warn',
      ),
    );
  }
  return problems;
}

function headlineFloorProblemsOf(name, toolName, verdict) {
  if (verdict?.headline === undefined) {
    return [
      `${name}: 写工具 ${toolName} 的 needsApproval 回了 ask，但没有 headline —— ` +
        '审批屏标题要写成「动作 + 对象」的具体陈述（例如「解决缺陷 #136」），' +
        '不能只靠通用问句；用 writeApprovalOf 时传 headline，或自己在 verdict 里带上 { zh, en }',
    ];
  }
  const problems = [];
  for (const [lang, label] of [['zh', '中文'], ['en', '英文']]) {
    const value = text(verdict.headline?.[lang]);
    if (value === '') {
      problems.push(`${name}: 写工具 ${toolName} 的 headline 缺少${label} —— 标题要中英文都能上屏`);
      continue;
    }
    if (/[\r\n]/.test(value)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 headline（${label}）里有换行 —— 标题是一句陈述，必须单行`,
      );
    }
    const cap = HEAD_BUDGETS.headline * (lang === 'en' ? EN_RATIO : 1);
    if (value.length > cap) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 headline（${label}）太长（${value.length} > ${cap}）：「${value}」—— ` +
          '标题只写动作 + 对象；细节放四行表或 render',
      );
    }
    if (/(?:允许吗|Allow\?)\s*$/i.test(value)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 headline（${label}）以「允许吗 / Allow?」收尾 —— ` +
          '标题应是一句具体陈述，问题交给「拒绝 / 允许一次」两个按钮',
      );
    }
    if (PLAN_BAD.test(value) || /^(待填|TODO|TBD)$/i.test(value)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的 headline（${label}）是占位或调试值：「${value}」`,
      );
    }
  }
  return problems;
}

function headlineProblemsOf(name, toolName, verdict, facts, when = '', scale = 1) {
  const problems = [];
  const blocked = facts !== undefined && 'blocked' in facts;
  const hasDetail = facts !== undefined && !blocked;
  const segments = [
    ['明细（approvalDetail）', 'detail', hasDetail ? text(facts.zh) : '', hasDetail ? text(facts.en) : ''],
    ['问句（question）', 'question', text(verdict?.question?.zh), text(verdict?.question?.en)],
    ['回退句（fallback）', 'fallback', text(verdict?.fallback?.zh), text(verdict?.fallback?.en)],
  ];
  for (const [label, key, zh, en] of segments) {
    if (zh === '' && en === '') continue;
    if (/\n|\r/.test(zh) || /\n|\r/.test(en)) {
      problems.push(
        `${name}: 写工具 ${toolName} 的${label}${when}里有换行 —— 审批头行是纯文本、没有 white-space，` +
          `换行会被合并为空格，屏幕上会挤成一行。请压缩成一句，长内容放入 approval.render（卡片上的该格详情）`,
      );
    }
    const cap = HEAD_BUDGETS[key] * scale;
    const enCap = Math.round(cap * EN_RATIO);
    if (zh.length > cap) {
      problems.push(
        `${name}: 写工具 ${toolName} 的${label}${when}太长（${zh.length} 字 > 预算 ${cap} 字）：「${zh}」—— ` +
          `头行三段各有预算（明细 ≤${HEAD_BUDGETS.detail} / 问句 ≤${HEAD_BUDGETS.question} / ` +
          `回退句 ≤${HEAD_BUDGETS.fallback} 字），其余（列表 / 正文 / 多字段 / 可变长内容）放入 approval.render 该格`,
      );
    }
    if (en.length > enCap) {
      problems.push(
        `${name}: 写工具 ${toolName} 的${label}${when}（英文）太长（${en.length} 字符 > 预算 ${enCap}）：「${en}」—— ` +
          `英文侧按中文的 ${EN_RATIO} 倍计算，超出时同样移入 approval.render`,
      );
    }
  }
  return problems;
}


export { headlineFloorProblemsOf, headlineProblemsOf, planProblemsOf };

function placeholderOf(schema) {
  if (typeof schema !== 'object' || schema === null) return null;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'string') return 'probe';
  if (schema.type === 'number' || schema.type === 'integer') return 1;
  if (schema.type === 'boolean') return true;
  if (schema.type === 'array') return [];
  if (schema.type === 'object') return {};
  return null;
}

function probeCallOf(tool) {
  const schema = tool?.parameters;
  if (typeof schema !== 'object' || schema === null) {
    return { arguments: {}, shaped: false };
  }
  const properties = typeof schema.properties === 'object' && schema.properties !== null ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const args = {};
  for (const key of required) args[key] = placeholderOf(properties[key]);
  if (Object.prototype.hasOwnProperty.call(properties, 'confirm')) args.confirm = true;
  return { arguments: args, shaped: true };
}

const LONG_SCALE = 3;

const FREE_TEXT = /message|note|reason|body|text|content|comment|title|description|summary/i;
const LONG_TEXT = '这里是一段真实长度的正文用来量头行预算不要把这种内容放进标题里'.repeat(2);
const LONG_ID = '真实长度的名字十二个字';

function budgetProbeOf(tool) {
  const schema = tool?.parameters;
  if (typeof schema !== 'object' || schema === null) return undefined;
  const properties = typeof schema.properties === 'object' && schema.properties !== null ? schema.properties : {};
  const args = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (key === 'confirm') {
      args.confirm = true;
      continue;
    }
    if (Array.isArray(prop?.enum) && prop.enum.length > 0) args[key] = prop.enum[0];
    else if (prop?.type === 'string') args[key] = FREE_TEXT.test(key) ? LONG_TEXT : LONG_ID;
    else if (prop?.type === 'number' || prop?.type === 'integer') args[key] = 1;
    else if (prop?.type === 'boolean') args[key] = true;
    else if (prop?.type === 'array') args[key] = [];
    else if (prop?.type === 'object') args[key] = {};
  }
  return args;
}


export { LONG_SCALE, budgetProbeOf, probeCallOf };
