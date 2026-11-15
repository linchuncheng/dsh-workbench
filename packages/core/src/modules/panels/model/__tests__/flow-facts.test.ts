import { describe, expect, it } from 'vitest';
import { DIY_FLOW_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { panelsFactsOf } from '../handoff';
import { DIY_PLAN_TOOL, DIY_STEP_TOOL } from '../../unit';

describe('流程动了就说一声', () => {
  it('★★ 两把流程工具跑完都标脏面板进度那一格，界面不用自己轮询', () => {
    for (const tool of [DIY_PLAN_TOOL, DIY_STEP_TOOL]) {
      expect(panelsFactsOf({ source: tool, args: {}, result: {} } as never, []), tool).toEqual([DIY_FLOW_ROUTE]);
    }
  });

  it('★ 别的事不变：装模块还是那两格', () => {
    expect(panelsFactsOf({ source: 'workbench_diy_status', args: {}, result: {} } as never, [])).not.toEqual([
      DIY_FLOW_ROUTE,
    ]);
  });
});
