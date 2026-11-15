import type { FlowDefinition } from '@dsh-workbench/shared/host';

export const DIY_FLOW_ACTIONS = {
  awaitAnswer: 'diy.await-answer',
  probe: 'diy.probe',
  install: 'diy.install',
  ledger: 'diy.keep-ledger',
} as const;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    destination: { type: 'string', enum: ['ready', 'once', 'reroute', 'board', 'headless'] },
    recommend: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['destination', 'recommend', 'summary'],
  additionalProperties: false,
} as const;

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    cells: { type: 'string' },
    steps: { type: 'string' },
    minutes: { type: 'string' },
    sketch: { type: 'string' },
  },
  required: ['cells', 'steps', 'minutes', 'sketch'],
  additionalProperties: false,
} as const;

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'array', items: { type: 'string' } },
    unverified: { type: 'array', items: { type: 'string' } },
  },
  required: ['passed', 'unverified'],
  additionalProperties: false,
} as const;

const READ_ONLY = [
  'workbench_diy_status',
  'workbench_diy_panel',
  'workbench_diy_components',
  'workbench_diy_recon',
  'workbench_diy_spec',
  'workbench_diy_state',
  'workbench_diy_html',
  'workbench_diy_find',
  'workbench_diy_wait',
  'workbench_diy_screenshot',
  'workbench_diy_network',
  'workbench_diy_logs_watch',
  'workbench_diy_logs_read',
  'workbench_diy_logs_stop',
  'workbench_diy_eval',
  'workbench_diy_show',
] as const;

const WRITE_TOOLS = [
  'write',
  'edit',
  'bash',
  'workbench_diy_components',
  'workbench_diy_spec',
  'workbench_diy_status',
  'workbench_diy_panel',
  'workbench_diy_show',
] as const;

const isBoard = { $eq: [{ $ref: 'steps.judge.destination' }, { $lit: 'board' }] } as const;

export const DIY_BOARD_FLOW: FlowDefinition = {
  id: 'diy-board',
  title: '做一张看板卡片',
  steps: [
    {
      id: 'judge',
      title: '判去向',
      agent: {
        label: '判去向',
        prompt: {
          $lit:
            '先把用户这句话复述成一行，再按工作台独有能力的正面清单判断去向（用现成的 / 一次性 / 改道 / 有看板 / 无看板），' +
            '只回结构化结果：destination、recommend（一句推荐，带理由）、summary（复述那一行）。不要动任何文件。',
        },
        tools: { allow: [...READ_ONLY], deny: ['write', 'edit', 'bash'] },
        schema: JUDGE_SCHEMA,
      },
    },
    {
      id: 'plan',
      title: '计划',
      when: isBoard,
      agent: {
        label: '计划',
        prompt: {
          $lit:
            '基于上一步的判定给出一版计划：cells（做几格）、steps（大概几步）、minutes（大概多久）、sketch（纯文本草图）。' +
            '草图里数字只能写占位并注明；不要动文件。',
        },
        tools: { allow: [...READ_ONLY], deny: ['write', 'edit', 'bash'] },
        schema: PLAN_SCHEMA,
      },
    },
    {
      id: 'confirm',
      title: '等她点头',
      when: isBoard,
      action: DIY_FLOW_ACTIONS.awaitAnswer,
      with: { sketch: { $ref: 'steps.plan.sketch' }, minutes: { $ref: 'steps.plan.minutes' } },
    },
    {
      id: 'probe',
      title: '站探',
      when: isBoard,
      agent: {
        label: '站探',
        prompt: {
          $lit:
            '摸清这个系统：有哪些可用的读取口、要什么参数、登录态还在不在。只读，不要写文件。' +
            '每摸到一项就往进度里写一句。登录过期就停下来等人处理。',
        },
        tools: { allow: [...READ_ONLY], deny: ['write', 'edit', 'bash'] },
      },
      retry: { attempts: 2 },
    },
    {
      id: 'build',
      title: '建模块',
      when: isBoard,
      agent: {
        label: '建模块',
        prompt: { $lit: '按计划与站探结果把模块建出来，构建通过为止。' },
        tools: { allow: [...WRITE_TOOLS] },
      },
      retry: { attempts: 2 },
    },
    {
      id: 'install',
      title: '装',
      when: isBoard,
      action: DIY_FLOW_ACTIONS.install,
      with: { unit: { $ref: 'steps.judge.summary' } },
      retry: { attempts: 1 },
    },
    {
      id: 'verify',
      title: '验收',
      when: isBoard,
      agent: {
        label: '验收',
        prompt: {
          $lit:
            '在真卡片上逐条走一遍验收清单，只读。回 passed 与 unverified 两个数组；没走通的不许写进 passed。',
        },
        tools: { allow: [...READ_ONLY], deny: ['write', 'edit', 'bash'] },
        schema: VERIFY_SCHEMA,
      },
    },
    {
      id: 'ledger',
      title: '留账',
      when: isBoard,
      action: DIY_FLOW_ACTIONS.ledger,
      with: { passed: { $ref: 'steps.verify.passed' }, unverified: { $ref: 'steps.verify.unverified' } },
    },
  ],
};

export const DIY_TWEAK_FLOW: FlowDefinition = {
  id: 'diy-tweak',
  title: '改一格',
  steps: [
    {
      id: 'plan',
      title: '小计划',
      agent: {
        label: '小计划',
        prompt: {
          $lit:
            '先复述这张卡上一次的设定（读 design.json），再说清这次只改哪一格、为什么。回 cells / steps / minutes / sketch。',
        },
        tools: { allow: [...READ_ONLY], deny: ['write', 'edit', 'bash'] },
        schema: PLAN_SCHEMA,
      },
    },
    {
      id: 'build',
      title: '改模块',
      agent: {
        label: '改模块',
        prompt: { $lit: '只改这一格，不重跑站探、不重装；改完构建通过。' },
        tools: { allow: [...WRITE_TOOLS] },
      },
      retry: { attempts: 2 },
    },
    {
      id: 'install',
      title: '热换',
      action: DIY_FLOW_ACTIONS.install,
      with: { unit: { $ref: 'steps.plan.sketch' } },
      retry: { attempts: 1 },
    },
    {
      id: 'verify',
      title: '只验那格',
      agent: {
        label: '只验那格',
        prompt: { $lit: '只验改过的那一格，回 passed / unverified。' },
        tools: { allow: [...READ_ONLY], deny: ['write', 'edit', 'bash'] },
        schema: VERIFY_SCHEMA,
      },
    },
  ],
};
