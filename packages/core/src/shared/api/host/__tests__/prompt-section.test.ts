import { describe, expect, it, vi } from 'vitest';
import type { DshAssemblyContext, DshHostContext } from '@dsh-workbench/shared/host';
import { registerPromptSection } from '../prompt-section';

interface Section {
  readonly name: string;
  readonly order: number;
  readonly text: (context: DshAssemblyContext) => string;
}

function hostWith(register: ((section: Section) => () => void) | undefined, info = vi.fn(), warn = vi.fn()) {
  const ctx = {
    get: (key: string) => (key === 'systemPrompt' && register !== undefined ? { section: register } : undefined),
    logger: { info, warn },
  } as unknown as DshHostContext;
  return { ctx, info, warn };
}

const contextOf = (session = 's-1', preset = 'standard'): DshAssemblyContext =>
  ({ agent: { session: { id: session, header: { agentPreset: preset } } } }) as unknown as DshAssemblyContext;

const BASE = {
  name: 'workbench:x',
  order: 42,
  text: 'hello',
  isChild: () => false,
  absent: '没有 systemPrompt',
  failed: '注册失败',
};

describe('registerPromptSection（提示词段的唯一写口）', () => {
  it('注册一段：名字、顺序、文本按参数给', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    const dispose = registerPromptSection(ctx, BASE);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.name).toBe('workbench:x');
    expect(seen[0]?.order).toBe(42);
    expect(seen[0]?.text(contextOf())).toBe('hello');
    expect(() => dispose()).not.toThrow();
  });

  it('子会话不给：isChild 命中就是空串', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    registerPromptSection(ctx, { ...BASE, isChild: (id) => id === 'child-1' });

    expect(seen[0]?.text(contextOf('child-1'))).toBe('');
    expect(seen[0]?.text(contextOf('s-1'))).toBe('hello');
  });

  it('visible 为假就是空串（默认恒真；没有 agent 也算真）', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    registerPromptSection(ctx, { ...BASE, visible: (scope) => scope !== null && scope.preset === 'diy' });

    expect(seen[0]?.text(contextOf('s-1', 'standard'))).toBe('');
    expect(seen[0]?.text(contextOf('s-1', 'diy'))).toBe('hello');
    expect(seen[0]?.text({} as DshAssemblyContext)).toBe('');
  });

  it('没有 systemPrompt 服务：只记日志，返回可调用的 disposer', () => {
    const { ctx, info } = hostWith(undefined);

    const dispose = registerPromptSection(ctx, BASE);

    expect(String(info.mock.calls[0]?.[0])).toContain('没有 systemPrompt');
    expect(() => dispose()).not.toThrow();
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

    const dispose = registerPromptSection(ctx, BASE);

    expect(String(warn.mock.calls[0]?.[0])).toContain('注册失败');
    expect(() => dispose()).not.toThrow();
  });
});
