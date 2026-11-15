import type { FlowDefinition, FlowNodeStep } from '@dsh-workbench/shared/host';

export interface DiyFlow extends Omit<FlowDefinition, 'steps'> {
  readonly steps: readonly FlowNodeStep[];
}

const WRITE = ['write', 'edit'] as const;

const isBoard = { $eq: [{ $ref: 'steps.judge.destination' }, { $lit: 'board' }] } as const;

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
  properties: {
    cells: { type: 'string' },
    steps: { type: 'string' },
    minutes: { type: 'string' },
    sketch: { type: 'string' },
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
    { id: 'judge', title: '判去向', tools: lockedTools, schema: JUDGE_SCHEMA },
    { id: 'plan', title: '计划', when: isBoard, tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'probe', title: '站探', when: isBoard, tools: lockedTools, retry: { attempts: 2 }, schema: PROBE_SCHEMA },
    { id: 'build', title: '建模块', when: isBoard, tools: openTools, retry: { attempts: 2 }, schema: BUILD_SCHEMA },
    { id: 'install', title: '装', when: isBoard, tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '验收', when: isBoard, tools: lockedTools, retry: { attempts: 1 }, schema: VERIFY_SCHEMA },
    { id: 'ledger', title: '留账', when: isBoard, tools: openTools, schema: LEDGER_SCHEMA },
  ],
};

export const DIY_TWEAK_FLOW: DiyFlow = {
  id: 'diy-tweak',
  title: '改一格',
  steps: [
    { id: 'plan', title: '小计划', tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'build', title: '改模块', tools: openTools, schema: BUILD_SCHEMA },
    { id: 'install', title: '热换', tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '只验那格', tools: lockedTools, schema: VERIFY_SCHEMA },
  ],
};

export const DIY_BOARD_STEPS = DIY_BOARD_FLOW.steps.map((step) => step.id);
