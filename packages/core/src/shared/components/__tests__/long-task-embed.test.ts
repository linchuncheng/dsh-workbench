import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string =>
  readFileSync(new URL(name, HERE), 'utf8').replaceAll('\r\n', '\n');

const RUN = read('long-task/LongTaskRun.tsx');
const SECTION = read('long-task/LongTaskSection.tsx');
const HANDLERS = read('long-task/long-task-handlers.ts');
const CLIENT = read('../../app/client.tsx');

describe('LongTaskRun / LongTaskSection：模块把外壳那套长任务行搬进自己的 DOM', () => {
  it('★★ 单条：只画传进来的那一趟，标题 / 行尾链接可覆盖', () => {
    expect(RUN).toContain('rows: [props.run]');
    expect(RUN).toContain('...(props.links === undefined ? {} : { links: props.links })');
    expect(RUN).toContain('...(props.headline === undefined ? {} : { headline: props.headline })');
    expect(RUN).toContain('...longTaskHandlers(wiring, props.t)');
  });

  it('★★ 平铺：可过滤、可整批给覆盖；没有就什么都不画', () => {
    expect(SECTION).toContain('props.filter === undefined ? wiring.feed.runs : wiring.feed.runs.filter(props.filter)');
    expect(SECTION).toContain('props.overrides(rows)');
    expect(SECTION).toContain('if (rows.length === 0) return null;');
  });

  it('★★ 两个组件都自接线：读 / 停 / 重查 / 回执 / 登录 / 打开 / 复制', () => {
    expect(RUN).toContain('useLongTaskWiring({ unit: props.unit, workspace: props.workspace })');
    expect(SECTION).toContain('useLongTaskWiring({ unit: props.unit, workspace: props.workspace })');
    expect(HANDLERS).toContain('void feed.stop(id);');
    expect(HANDLERS).toContain('void feed.recheck(id);');
    expect(HANDLERS).toContain('void feed.answer(id, values);');
    expect(HANDLERS).toContain('onLogin: wiring.open,');
    expect(HANDLERS).toContain('onOpenUrl: wiring.open,');
    expect(HANDLERS).toContain('onCopy: wiring.copy,');
  });

  it('★★ kit 出货：两个名字都进组件表（模块不用自己接轮询）', () => {
    expect(CLIENT).toContain('LongTaskRow, LongTaskRun, LongTaskSection,');
  });
});
