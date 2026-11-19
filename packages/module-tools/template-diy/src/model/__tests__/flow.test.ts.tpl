import { describe, expect, it } from 'vitest';

import { headlineOf, runIsLive, sampleFlow, type SampleRun } from '../flow';

const run = (over: Partial<SampleRun> = {}): SampleRun => ({
  id: 'run-1',
  status: 'running',
  step: '',
  steps: [],
  ...over,
});

describe('示例流程的模型', () => {
  it('两步：先读取目录、再汇总，步骤 id 就是动作名', () => {
    const flow = sampleFlow();
    expect(flow.steps.map((step) => ('action' in step ? step.action : 'sub'))).toEqual(['read', 'summarize']);
    expect(flow.target).toEqual({ $ref: 'in.path' });
  });

  it('running / needs-human / needs-login 都算运行中', () => {
    expect(runIsLive(run())).toBe(true);
    expect(runIsLive(run({ status: 'needs-human' }))).toBe(true);
    expect(runIsLive(run({ status: 'needs-login' }))).toBe(true);
    expect(runIsLive(run({ status: 'ok' }))).toBe(false);
    expect(runIsLive(run({ status: 'failed' }))).toBe(false);
    expect(runIsLive(run({ status: 'stopped' }))).toBe(false);
  });

  it('标题按六态与当前步骤给出状态', () => {
    expect(headlineOf(run())).toBe('示例流程运行中');
    expect(headlineOf(run({ step: '读取目录' }))).toBe('示例流程运行中：读取目录');
    expect(headlineOf(run({ status: 'ok' }))).toBe('示例流程已完成');
    expect(headlineOf(run({ status: 'failed' }))).toBe('示例流程失败');
    expect(headlineOf(run({ status: 'stopped' }))).toBe('示例流程已停止');
    expect(headlineOf(run({ status: 'needs-human' }))).toBe('示例流程等待处理');
    expect(headlineOf(run({ status: 'needs-login' }))).toBe('示例流程需要登录');
  });
});
