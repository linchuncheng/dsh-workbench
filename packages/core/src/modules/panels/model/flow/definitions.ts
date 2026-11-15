import type { FlowDefinition, FlowNodeStep } from '@dsh-workbench/shared/host';

export interface DiyFlow extends Omit<FlowDefinition, 'steps'> {
  readonly steps: readonly FlowNodeStep[];
}

const WRITE = ['write', 'edit', 'bash'] as const;

const isBoard = { $eq: [{ $ref: 'steps.judge.destination' }, { $lit: 'board' }] } as const;

const JUDGE_SCHEMA = { required: ['destination', 'summary'] } as const;
const lockedTools = { deny: [...WRITE] } as const;
const openTools = {} as const;

export const DIY_BOARD_FLOW: DiyFlow = {
  id: 'diy-board',
  title: '做一张看板卡片',
  steps: [
    { id: 'judge', title: '判去向', tools: lockedTools, schema: JUDGE_SCHEMA },
    { id: 'plan', title: '计划', when: isBoard, tools: lockedTools },
    { id: 'confirm', title: '等她批准', when: isBoard, tools: lockedTools },
    { id: 'probe', title: '站探', when: isBoard, tools: lockedTools, retry: { attempts: 2 } },
    { id: 'build', title: '建模块', when: isBoard, tools: openTools, retry: { attempts: 2 } },
    { id: 'install', title: '装', when: isBoard, tools: lockedTools },
    { id: 'verify', title: '验收', when: isBoard, tools: lockedTools, retry: { attempts: 1 } },
    { id: 'ledger', title: '留账', when: isBoard, tools: openTools },
  ],
};

export const DIY_TWEAK_FLOW: DiyFlow = {
  id: 'diy-tweak',
  title: '改一格',
  steps: [
    { id: 'plan', title: '小计划', tools: lockedTools },
    { id: 'build', title: '改模块', tools: openTools },
    { id: 'install', title: '热换', tools: lockedTools },
    { id: 'verify', title: '只验那格', tools: lockedTools },
  ],
};

export const DIY_BOARD_STEPS = DIY_BOARD_FLOW.steps.map((step) => step.id);
