import { describe, expect, it, vi } from 'vitest';
import type { DshAssemblyContext, DshHostContext } from '@dsh-workbench/shared/host';
import { PRIORITY_SECTION, PRIORITY_TEXT, registerWorkbenchPriority } from '../workbench-priority';

interface Section {
  readonly name: string;
  readonly order: number;
  readonly text: (context: DshAssemblyContext) => string;
}

function hostWith(register: ((section: Section) => () => void) | undefined, info = vi.fn()) {
  const ctx = {
    get: (key: string) => (key === 'systemPrompt' && register !== undefined ? { section: register } : undefined),
    logger: { info, warn: vi.fn() },
  } as unknown as DshHostContext;
  return { ctx, info };
}

const sessionOf = (id: string): DshAssemblyContext =>
  ({ agent: { session: { id } } }) as unknown as DshAssemblyContext;

describe('工作台工具优先：一句策略进系统提示词', () => {
  it('★ 段名与顺序固定，普通会话拿到的就是那句策略', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    registerWorkbenchPriority(ctx, () => false);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.name).toBe(PRIORITY_SECTION);
    expect(seen[0]?.order).toBe(700);
    expect(seen[0]?.text(sessionOf('s-1'))).toBe(PRIORITY_TEXT);
  });

  it('★ flow 子 agent 不给这句：它们的工具面里没有 list / open / close', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    registerWorkbenchPriority(ctx, (id) => id === 'child-1');

    expect(seen[0]?.text(sessionOf('child-1'))).toBe('');
    expect(seen[0]?.text(sessionOf('s-1'))).toBe(PRIORITY_TEXT);
    expect(seen[0]?.text({} as DshAssemblyContext)).toBe(PRIORITY_TEXT);
  });

  it('没有 systemPrompt 服务：只记日志，不抛', () => {
    const info = vi.fn();
    const { ctx } = hostWith(undefined, info);

    expect(() => registerWorkbenchPriority(ctx, () => false)).not.toThrow();
    expect(info).toHaveBeenCalled();
  });

  it('注册抛错：记日志并返回可调用的 disposer', () => {
    const warn = vi.fn();
    const ctx = {
      get: () => ({
        section: () => {
          throw new Error('dup');
        },
      }),
      logger: { info: vi.fn(), warn },
    } as unknown as DshHostContext;

    const disposer = registerWorkbenchPriority(ctx, () => false);

    expect(warn).toHaveBeenCalled();
    expect(() => disposer()).not.toThrow();
  });
});
