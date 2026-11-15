import { describe, expect, it } from 'vitest';
import { positionOf, visibleSteps } from '../model/flow/position';
import { PROGRESS_OUTPUT } from '../model/flow/progress-output';

describe('第几步与还剩几步', () => {
  it('★★ 看板六步、没有看板五步，顺序就是跑的顺序', () => {
    expect(visibleSteps('board').map((one) => one.id)).toEqual([
      'probe',
      'plan',
      'build',
      'install',
      'verify',
      'ledger',
    ]);
    expect(visibleSteps('headless').map((one) => one.id)).toEqual(['probe', 'build', 'install', 'verify', 'ledger']);
  });

  it('★ 停在站探是第 1 步，后面还有 5 步', () => {
    expect(positionOf('probe', 'board')).toEqual({ index: 1, total: 6, remaining: 5 });
    expect(positionOf('ledger', 'board')).toEqual({ index: 6, total: 6, remaining: 0 });
  });

  it('★ 没有流程时不说第几步，也不假装还剩几步', () => {
    expect(positionOf(null, 'board')).toEqual({ index: 0, total: 6, remaining: 0 });
  });

  it('★ 两把流程工具回话是同一份形状', () => {
    const properties = (PROGRESS_OUTPUT.schema as { properties: Record<string, unknown> }).properties;

    expect(Object.keys(properties)).toEqual(['text', 'step', 'index', 'total', 'remaining', 'done']);
  });
});
