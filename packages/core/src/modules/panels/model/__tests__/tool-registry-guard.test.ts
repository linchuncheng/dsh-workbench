import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { TOOL_NAMES_SERVICE, createToolNameLedger } from '@/kernel/host/tool-output-budget';
import { objectSchemaOf, toolRegistryOf } from '../tool-registry-guard';

const ctxWith = (tools: unknown, skipped: string[]): DshHostContext =>
  ({
    get: (key: string) => (key === 'tools' ? tools : undefined),
    logger: { info: (message: string) => skipped.push(message) },
  }) as unknown as DshHostContext;

describe('工具注册的那道门：没有 tools 服务就安静跳过', () => {
  it('★ 有服务：原样拿回来，不写日志', () => {
    const skipped: string[] = [];
    const tools = { register: () => undefined };
    expect(toolRegistryOf(ctxWith(tools, skipped), '跳过录制')).toBe(tools);
    expect(skipped).toEqual([]);
  });

  it('★★ 没服务：返回 undefined，并把跳过的原因说清（带上前缀）', () => {
    const skipped: string[] = [];
    expect(toolRegistryOf(ctxWith(undefined, skipped), '跳过录制')).toBeUndefined();
    expect(skipped).toEqual(['[dsh-workbench] 没有 tools 服务，跳过录制']);
  });

  it('★ 没有 logger 也不炸：只是没人听见', () => {
    const ctx = { get: () => undefined } as unknown as DshHostContext;
    expect(toolRegistryOf(ctx, '跳过录制')).toBeUndefined();
  });
});

describe('工具注册的那道门：记名字（输出预算认得出是不是工作台的）', () => {
  it('★★ 注册前先记账，再把定义原样交给 tools', () => {
    const names = createToolNameLedger();
    const registered: string[] = [];
    const tools = {
      register: (definition: { name: string }) => {
        registered.push(definition.name);
        return () => undefined;
      },
    };
    const ctx = {
      get: (key: string) => (key === 'tools' ? tools : key === TOOL_NAMES_SERVICE ? names : undefined),
    } as unknown as DshHostContext;
    const registry = toolRegistryOf(ctx, '跳过录制');
    registry?.register({ name: 'workbench_demo_list' } as never);
    expect(names.has('workbench_demo_list')).toBe(true);
    expect(names.size).toBe(1);
    expect(registered).toEqual(['workbench_demo_list']);
  });
});

describe('对象 schema 那一层壳', () => {
  it('★ 只给属性：补上 type 与 properties', () => {
    expect(objectSchemaOf({ a: { type: 'string' } })).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });

  it('★★ 额外的那几项（required / additionalProperties / description）原样带上', () => {
    expect(
      objectSchemaOf({ a: { type: 'string' } }, { required: ['a'], additionalProperties: false, description: '一段话' }),
    ).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
      additionalProperties: false,
      description: '一段话',
    });
  });
});
