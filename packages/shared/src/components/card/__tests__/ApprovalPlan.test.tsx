import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/react.js', () => ({
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
}));

import { ApprovalPlan, type ApprovalPlanProps } from '../ApprovalPlan.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown> | null;
  readonly children: unknown[];
}

function flatten(value: unknown): AnyElement[] {
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value !== 'object' || value === null || !('type' in value)) return [];
  const element = value as AnyElement;
  return [element, ...element.children.flatMap(flatten)];
}

function plan(props: ApprovalPlanProps): AnyElement {
  return ApprovalPlan(props) as unknown as AnyElement;
}

function lineTexts(value: unknown): string[] {
  return flatten(value)
    .filter((element) => element.props?.['className'] === 'wb-approvalLine')
    .map((element) => element.children.filter((child) => typeof child === 'string').join(''));
}

describe('审批表的多行值', () => {
  it('★ 字符串数组每一项一行，warn 也一样', () => {
    const root = plan({
      rows: [
        { label: '修改后', value: ['重新生成 dist', '版本号保持 1.5.0'] },
        { label: '影响范围', value: '只改这三个模块' },
      ],
      warn: ['会短暂空白', '不要同时改'],
    });

    expect(lineTexts(root)).toEqual(['重新生成 dist', '版本号保持 1.5.0', '会短暂空白', '不要同时改']);
  });

  it('★ 单字符串照旧一行，不额外包一层', () => {
    const root = plan({ rows: [{ label: '修改后', value: '重新生成 dist' }] });

    expect(lineTexts(root)).toEqual([]);
  });
});
