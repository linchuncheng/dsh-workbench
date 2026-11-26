import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { boundToolOutput } from '../tool-output-policy';
import { installToolResultEffects, provideToolNames } from '../tool-result-effects';

const exec = { name: 'workbench_demo_list', callId: 'c1', agent: { session: { header: { id: 's1' } } } };
const long = Array.from({ length: 20000 }, () => '中').join('');

function ctxWith(store: unknown, warn = vi.fn()): DshHostContext {
  return {
    get: (key: string) => (key === 'spillStore' ? store : undefined),
    logger: { warn },
  } as unknown as DshHostContext;
}

function textOf(blocks: readonly { type: string; text?: string }[] | undefined): string {
  const block = blocks?.[0];
  return block?.type === 'text' ? (block.text ?? '') : '';
}

describe('工作台工具输出兜底', () => {
  it('★ 预算内原样放回去：不动内容，也不写盘', async () => {
    const saveText = vi.fn();
    expect(await boundToolOutput(ctxWith({ saveText }), exec, [{ type: 'text', text: 'short' }])).toBeUndefined();
    expect(saveText).not.toHaveBeenCalled();
  });

  it('★★ 超预算：整份落盘，模型只看到头尾 + 路径', async () => {
    const saveText = vi.fn(async () => ({ locator: '/tmp/full.txt', retrievalHint: 'h' }));
    const bounded = await boundToolOutput(ctxWith({ saveText }), exec, [{ type: 'text', text: long }]);
    expect(saveText).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { sessionId: 's1' },
        source: expect.objectContaining({ toolName: 'workbench_demo_list', callId: 'c1' }),
        content: long,
      }),
    );
    expect(textOf(bounded)).toContain('/tmp/full.txt');
    expect(textOf(bounded).length).toBeLessThan(8192);
  });

  it('★★★ 落不了盘：截断 + 明说存不下，绝不抛', async () => {
    const bounded = await boundToolOutput(ctxWith(undefined), exec, [{ type: 'text', text: long }]);
    expect(textOf(bounded)).toContain('存不下');
  });

  it('★★★ 落盘抛错：降级成截断，不把成功的调用变成失败', async () => {
    const warn = vi.fn();
    const saveText = vi.fn(async () => {
      throw new Error('disk full');
    });
    const bounded = await boundToolOutput(ctxWith({ saveText }, warn), exec, [{ type: 'text', text: long }]);
    expect(textOf(bounded)).toContain('存不下');
    expect(warn).toHaveBeenCalled();
  });

  it('没有会话 owner：落不了盘，截断', async () => {
    const bounded = await boundToolOutput(ctxWith({ saveText: vi.fn() }), { name: 'workbench_x' }, [
      { type: 'text', text: long },
    ]);
    expect(textOf(bounded)).toContain('存不下');
  });

  it('带非文本块：不碰（图片由平台自己处理）', async () => {
    const saveText = vi.fn();
    expect(
      await boundToolOutput(ctxWith({ saveText }), exec, [{ type: 'image' } as never]),
    ).toBeUndefined();
    expect(saveText).not.toHaveBeenCalled();
  });
});

type PostExecute = (
  exec: Record<string, unknown>,
  result: { content: unknown[] },
  next: () => Promise<{ kind: 'accept' }>,
) => Promise<{ kind: string; content?: Array<{ type: string; text?: string }> }>;

function recordingCtx(store: unknown) {
  const listeners: PostExecute[] = [];
  const provided = new Map<string, unknown>();
  const ctx = {
    provide: (name: string, value: unknown) => {
      provided.set(name, value);
    },
    effect: (fn: () => unknown) => {
      fn();
    },
    on: (_event: string, listener: unknown) => {
      listeners.push(listener as PostExecute);
      return () => undefined;
    },
    get: (key: string) => (key === 'spillStore' ? store : provided.get(key)),
  } as unknown as DshHostContext;
  return { ctx, listeners, provided };
}

function install(store: unknown) {
  const { ctx, listeners } = recordingCtx(store);
  const toolNames = provideToolNames(ctx);
  toolNames.add('workbench_demo_list');
  installToolResultEffects(ctx, {
    toolNames,
    unitsOfTool: () => new Map(),
    factsOfMap: new Map(),
    facts: { bump: vi.fn() } as never,
    factsOfUnit: () => [],
  });
  return listeners.at(-1) as PostExecute;
}

describe('两个 post-execute 效果装在一起', () => {
  it('★★ 工作台的工具：超预算换成预览 + 路径', async () => {
    const budget = install({ saveText: async () => ({ locator: '/tmp/full.txt', retrievalHint: 'h' }) });
    const decision = await budget(
      { name: 'workbench_demo_list', callId: 'c1', agent: { session: { header: { id: 's1' } } } },
      { content: [{ type: 'text', text: long }] },
      async () => ({ kind: 'accept' as const }),
    );
    expect(decision.kind).toBe('accept');
    expect(decision.content?.[0]?.text).toContain('/tmp/full.txt');
  });

  it('★★★ dsh 自己的工具（没记名字）：原样放回，不碰', async () => {
    const saveText = vi.fn();
    const budget = install({ saveText });
    const decision = await budget(
      { name: 'read' },
      { content: [{ type: 'text', text: long }] },
      async () => ({ kind: 'accept' as const }),
    );
    expect(decision).toEqual({ kind: 'accept' });
    expect(saveText).not.toHaveBeenCalled();
  });

  it('★★★ 非 accept 的决策（被拒 / 被拦）：不动', async () => {
    const budget = install({ saveText: vi.fn() });
    const decision = await budget(
      { name: 'workbench_demo_list' },
      { content: [{ type: 'text', text: long }] },
      async () => ({ kind: 'block' as never }),
    );
    expect(decision).toEqual({ kind: 'block' });
  });
});
