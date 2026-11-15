import type { FlowDefinition, FlowNodeStep } from '@dsh-workbench/shared/host';

export interface DiyFlow extends Omit<FlowDefinition, 'steps'> {
  readonly steps: readonly FlowNodeStep[];
}

const WRITE = ['write', 'edit'] as const;

const isBoard = { $eq: [{ $ref: 'steps.judge.destination' }, { $lit: 'board' }] } as const;
const isBuild = {
  $in: [
    { $ref: 'steps.judge.destination' },
    ['board', 'headless'],
  ],
} as const;

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['destination', 'summary'],
  properties: {
    destination: { enum: ['ready', 'once', 'reroute', 'board', 'headless'] },
    summary: { type: 'string' },
  },
} as const;

const PLAN_SCHEMA = {
  type: 'object',
  required: ['see', 'do', 'agent', 'data'],
  properties: {
    cells: { type: 'string' },
    steps: { type: 'string' },
    minutes: { type: 'string' },
    shots: {
      type: 'array',
      items: {
        type: 'object',
        required: ['caption', 'ascii'],
        properties: { caption: { type: 'string' }, ascii: { type: 'string' } },
      },
    },
    see: { type: 'array', items: { type: 'string' } },
    do: { type: 'array', items: { type: 'string' } },
    agent: { type: 'array', items: { type: 'string' } },
    data: { type: 'array', items: { type: 'string' } },
  },
} as const;

const PROBE_SCHEMA = {
  type: 'object',
  required: ['sites'],
  properties: { sites: { type: 'array' } },
} as const;

const BUILD_SCHEMA = {
  type: 'object',
  required: ['unit'],
  properties: { unit: { type: 'string' } },
} as const;

const INSTALL_SCHEMA = {
  type: 'object',
  required: ['unit', 'installed'],
  properties: { unit: { type: 'string' }, installed: { type: 'boolean' } },
} as const;

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['passed', 'unverified'],
  properties: { passed: { type: 'array' }, unverified: { type: 'array' } },
} as const;

const LEDGER_SCHEMA = {
  type: 'object',
  required: ['design'],
  properties: { design: { type: 'string' } },
} as const;
const lockedTools = { deny: [...WRITE] } as const;
const openTools = {} as const;

export const DIY_BOARD_FLOW: DiyFlow = {
  id: 'diy-board',
  title: '做一张看板卡片',
  steps: [
    { id: 'judge', title: '确认需求', tools: lockedTools, schema: JUDGE_SCHEMA },
    { id: 'plan', title: '确认方案', when: isBoard, tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'probe', title: '查看数据来源', when: isBuild, tools: lockedTools, retry: { attempts: 2 }, schema: PROBE_SCHEMA },
    { id: 'build', title: '创建模块', when: isBuild, tools: openTools, retry: { attempts: 2 }, schema: BUILD_SCHEMA },
    { id: 'install', title: '添加模块到面板', when: isBuild, tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '检查模块显示', when: isBuild, tools: lockedTools, retry: { attempts: 1 }, schema: VERIFY_SCHEMA },
    { id: 'ledger', title: '保存这次的设计', when: isBuild, tools: openTools, schema: LEDGER_SCHEMA },
  ],
};

export const DIY_TWEAK_FLOW: DiyFlow = {
  id: 'diy-tweak',
  title: '改一格',
  steps: [
    { id: 'plan', title: '补一下方案', tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'build', title: '改模块', tools: openTools, schema: BUILD_SCHEMA },
    { id: 'install', title: '热换', tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '只验那格', tools: lockedTools, schema: VERIFY_SCHEMA },
  ],
};

export const DIY_BOARD_STEPS = DIY_BOARD_FLOW.steps.map((step) => step.id);
