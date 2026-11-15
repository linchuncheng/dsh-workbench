import type { FlowDefinition, FlowNodeStep } from '@dsh-workbench/shared/host';

export interface DiyFlow extends Omit<FlowDefinition, 'steps'> {
  readonly steps: readonly FlowNodeStep[];
}

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

const WRITE = ['write', 'edit', 'bash'] as const;

const isBoard = { $eq: [{ $ref: 'steps.judge.destination' }, { $lit: 'board' }] } as const;

const judgeTools = { allow: [...READ_ONLY, 'workbench_diy_plan'], deny: [...WRITE] } as const;
const readTools = { allow: [...READ_ONLY], deny: [...WRITE] } as const;
const buildTools = { allow: [...READ_ONLY, ...WRITE, 'workbench_diy_plan'] } as const;
const installTools = { allow: ['workbench_modules_install', 'workbench_diy_install'], deny: [...WRITE] } as const;
const ledgerTools = { allow: [...WRITE] } as const;

export const DIY_BOARD_FLOW: DiyFlow = {
  id: 'diy-board',
  title: '做一张看板卡片',
  steps: [
    { id: 'judge', title: '判去向', tools: judgeTools },
    { id: 'plan', title: '计划', when: isBoard, tools: judgeTools },
    { id: 'confirm', title: '等她点头', when: isBoard, tools: readTools },
    { id: 'probe', title: '站探', when: isBoard, tools: readTools },
    { id: 'build', title: '建模块', when: isBoard, tools: buildTools },
    { id: 'install', title: '装', when: isBoard, tools: installTools },
    { id: 'verify', title: '验收', when: isBoard, tools: readTools },
    { id: 'ledger', title: '留账', when: isBoard, tools: ledgerTools },
  ],
};

export const DIY_TWEAK_FLOW: DiyFlow = {
  id: 'diy-tweak',
  title: '改一格',
  steps: [
    { id: 'plan', title: '小计划', tools: judgeTools },
    { id: 'build', title: '改模块', tools: buildTools },
    { id: 'install', title: '热换', tools: installTools },
    { id: 'verify', title: '只验那格', tools: readTools },
  ],
};

export const DIY_BOARD_STEPS = DIY_BOARD_FLOW.steps.map((step) => step.id);
