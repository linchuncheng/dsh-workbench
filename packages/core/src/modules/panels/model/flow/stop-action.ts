import type { PostResource } from '@dsh-workbench/shared/host';
import { deliverDebugNotice, noticeMessage, type AgentsLookup } from '@/shared/api/host/diy-debug-act';
import type { DiyFlowRuns } from './runs';

export interface FlowStopDeps {
  readonly runs: DiyFlowRuns;
  readonly agents: () => AgentsLookup | undefined;
}

export const FLOW_STOP_RESOURCE = 'diy-flow-stop';

export function flowStopAction(deps: FlowStopDeps): PostResource {
  return {
    resource: FLOW_STOP_RESOURCE,
    handle(payload) {
      const session = (payload as { session?: unknown } | null)?.session;
      if (typeof session !== 'string' || session.trim() === '') {
        return { ok: false, text: '要停哪一条流程？没带会话号，停下来' };
      }
      const step = deps.runs.stepOf(session);
      if (step === null) {
        return { ok: false, text: '这条会话没有运行中的流程 —— 没什么可停的' };
      }
      const title = step.title ?? step.id;
      deps.runs.stop(session);
      const notice = noticeMessage(
        `用户按了停止：DIY 流程停在「${title}」这一步，流程已经结束。别再往下规划，也别接着调 DIY 工具；等她开口。`,
        `停在「${title}」`,
        'workbench-diy-flow',
      );
      return {
        ok: true,
        text: `已经停下（停在「${title}」）`,
        delivered: deliverDebugNotice(deps.agents(), session, notice, 'wake'),
      };
    },
  };
}
