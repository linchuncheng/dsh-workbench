import { describe, expect, it } from 'vitest';
import { createFlowHost } from '../kit.js';
import { schemaProblem } from '../schema.js';
import type { FlowDefinition } from '../types.js';

const chart: FlowDefinition = {
  id: 'typed',
  title: '带约定的图',
  steps: [
    {
      id: 'a',
      title: 'A',
      schema: {
        type: 'object',
        required: ['destination', 'summary'],
        properties: {
          destination: { enum: ['board', 'once'] },
          summary: { type: 'string' },
        },
      },
    },
  ],
};

describe('外部递进来的值，引擎自己校验', () => {
  it('★★ 缺字段被拒，点名缺哪个，流程不前进', async () => {
    const session = createFlowHost().open({ flow: chart, input: {}, workspace: '/w/a', onStep: () => {} });

    const provided = session.provide('a', { destination: 'board' });

    expect(provided).toEqual({ ok: false, problem: '结果.summary 要给' });
    expect(session.current()?.stepId).toBe('a');
  });

  it('★★ 值不在枚举里被拒，说清只能是什么', async () => {
    const session = createFlowHost().open({ flow: chart, input: {}, workspace: '/w/a', onStep: () => {} });

    const provided = session.provide('a', { destination: '看板', summary: 'x' });

    expect(provided).toEqual({ ok: false, problem: '结果.destination 只能是 board / once' });
    expect(session.current()?.stepId).toBe('a');
  });

  it('★ 合规的值才推进，且原样记下', async () => {
    const session = createFlowHost().open({ flow: chart, input: {}, workspace: '/w/a', onStep: () => {} });

    expect(session.provide('a', { destination: 'board', summary: '盯库存' })).toEqual({ ok: true });

    const result = await session.result;

    expect(result.steps).toEqual({ a: { destination: 'board', summary: '盯库存' } });
  });
});

describe('校验器本身', () => {
  it('★ 类型、必填、枚举、数组元素都查', () => {
    expect(schemaProblem('x', { type: 'number' }, '值')).toBe('值 要是 number');
    expect(schemaProblem({}, { required: ['a'] }, '值')).toBe('值.a 要给');
    expect(schemaProblem([1, 'x'], { type: 'array', items: { type: 'number' } }, '值')).toBe('值[1] 要是 number');
    expect(schemaProblem({ a: 1 }, { properties: { a: { type: 'string' } } }, '值')).toBe('值.a 要是 string');
    expect(schemaProblem(true, undefined, '值')).toBeNull();
  });
});
