import type { FlowDefinition, FlowNodeStep } from '@dsh-workbench/shared/host';
import {
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_STOP_TOOL,
} from '../../unit';

export interface DiyFlow extends Omit<FlowDefinition, 'steps'> {
  readonly steps: readonly FlowNodeStep[];
}

const WRITE = ['write', 'edit'] as const;

export const HEADLESS_TITLES: Readonly<Record<string, string>> = {
  install: '安装模块',
  verify: '检查模块功能',
};

const schemaOf = (
  required: readonly string[],
  properties: Record<string, unknown>,
): Record<string, unknown> => ({ type: 'object', required, properties });

const isBuild = { $in: [{ $ref: 'in.destination' }, ['board', 'headless']] } as const;

const PLAN_SCHEMA = schemaOf(['see', 'do', 'agent', 'data'], {
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
    data: { type: 'array', items: { type: 'string' } }
});

const PROBE_SCHEMA = schemaOf(['sites'], { sites: { type: 'array' } });

const BUILD_SCHEMA = schemaOf(['unit'], { unit: { type: 'string' } });

const INSTALL_SCHEMA = schemaOf(['unit', 'installed'], { unit: { type: 'string' }, installed: { type: 'boolean' } });

const VERIFY_SCHEMA = schemaOf(['passed', 'unverified'], { passed: { type: 'array' }, unverified: { type: 'array' } });

const LEDGER_SCHEMA = schemaOf(['design'], { design: { type: 'string' } });
const lockedTools = { deny: [...WRITE] } as const;
const openTools = {} as const;

export const DIY_BOARD_FLOW: DiyFlow = {
  id: 'diy-board',
  title: '做一张看板卡片',
  steps: [
    { id: 'probe', title: '查看数据来源', when: isBuild, tools: lockedTools, schema: PROBE_SCHEMA },
    { id: 'plan', title: '确认方案', when: isBuild, tools: lockedTools, schema: PLAN_SCHEMA },
    { id: 'build', title: '创建模块', when: isBuild, tools: openTools, schema: BUILD_SCHEMA },
    { id: 'install', title: '添加模块到面板', when: isBuild, tools: lockedTools, schema: INSTALL_SCHEMA },
    { id: 'verify', title: '检查模块显示', when: isBuild, tools: lockedTools, schema: VERIFY_SCHEMA },
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
    { id: 'ledger', title: '保存这次的设计', tools: openTools, schema: LEDGER_SCHEMA },
  ],
};

export const DIY_BOARD_STEPS = DIY_BOARD_FLOW.steps.map((step) => step.id);

const RECORD_SCHEMA = schemaOf(['rows'], { rows: { type: 'array' } });

const SCAN_SCHEMA = schemaOf(['needsSupplement', 'gaps'], {
  needsSupplement: { type: 'boolean' },
  gaps: { type: 'array', items: { type: 'string' } },
});

const SUPPLEMENT_SCHEMA = RECORD_SCHEMA;

const FINISH_SCHEMA = {
  type: 'object',
  required: ['done'],
  properties: { done: { type: 'boolean' } },
} as const;

export const DIY_WRITE_RECORD_FLOW: DiyFlow = {
  id: 'diy-write-record',
  title: '录制一次写入',
  steps: [
    {
      id: 'record',
      title: '录制',
      tools: { deny: [DIY_RECORD_STOP_TOOL] },
      schema: RECORD_SCHEMA,
    },
    {
      id: 'scan',
      title: '检查录制结果',
      tools: { deny: [DIY_RECORD_PREPARE_TOOL, DIY_RECORD_STOP_TOOL] },
      schema: SCAN_SCHEMA,
    },
    {
      id: 'supplement',
      title: '补录',
      when: { $not: { $eq: [{ $ref: 'steps.scan.needsSupplement' }, { $lit: false }] } },
      tools: { deny: [DIY_RECORD_STOP_TOOL] },
      schema: SUPPLEMENT_SCHEMA,
    },
    {
      id: 'finish',
      title: '完成',
      tools: { deny: [DIY_RECORD_PREPARE_TOOL] },
      schema: FINISH_SCHEMA,
    },
  ],
};

export function flowFor(destination: unknown): DiyFlow {
  if (destination === 'tweak') return DIY_TWEAK_FLOW;
  if (destination === 'write-record') return DIY_WRITE_RECORD_FLOW;
  return DIY_BOARD_FLOW;
}
