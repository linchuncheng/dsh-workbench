import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { defaultModelOf, moduleModelCatalogOf, moduleModelOf, mountModuleModels } from '../module-model';
import { WORKBENCH_SETTINGS_SERVICE } from '../workbench-settings';

function ctxOf(services: Record<string, unknown>): DshHostContext {
  return { get: (name: string) => services[name] } as unknown as DshHostContext;
}

function storeOf(moduleModel: { provider: string; model: string } | null): unknown {
  return { read: () => ({ mcpOnDemand: false, includePrerelease: false, moduleModel }) };
}

const llmOf = (input: {
  readonly providers: readonly { id: string; name: string }[];
  readonly models: Record<string, readonly { id: string; name: string }[] | Error>;
}): unknown => ({
  listProviders: () => input.providers,
  listModels: async (provider: string) => {
    const models = input.models[provider] ?? [];
    if (models instanceof Error) throw models;
    return models;
  },
});

const defaultModelOf_ = (selection: unknown): unknown => ({ currentSelection: () => selection });

describe('模块用的模型：从工作台设置里取', () => {
  it('★ 没选就跟 dsh 的默认模型：moduleModelOf 给 undefined，默认给 provider / model', () => {
    const ctx = ctxOf({
      [WORKBENCH_SETTINGS_SERVICE]: storeOf(null),
      agentDefaultModel: defaultModelOf_({ provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' }),
    });

    expect(moduleModelOf(ctx)).toBeUndefined();
    expect(defaultModelOf(ctx)).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
  });

  it('选了模块模型就原样给出，不再看默认模型', async () => {
    const ctx = ctxOf({
      [WORKBENCH_SETTINGS_SERVICE]: storeOf({ provider: 'p', model: 'm' }),
      agentDefaultModel: defaultModelOf_({ provider: 'deepseek', model: 'deepseek-chat' }),
    });

    expect(moduleModelOf(ctx)).toEqual({ provider: 'p', model: 'm' });
  });

  it('没有设置服务就没有模块模型；默认模型读不到或形状不对也给 undefined', () => {
    expect(moduleModelOf(ctxOf({}))).toBeUndefined();
    expect(defaultModelOf(ctxOf({}))).toBeUndefined();
    expect(defaultModelOf(ctxOf({ agentDefaultModel: { currentSelection: () => undefined } }))).toBeUndefined();
    expect(defaultModelOf(ctxOf({ agentDefaultModel: { currentSelection: () => ({ provider: '' }) } }))).toBeUndefined();
    expect(
      defaultModelOf(
        ctxOf({
          agentDefaultModel: {
            currentSelection: () => {
              throw new Error('没了');
            },
          },
        }),
      ),
    ).toBeUndefined();
  });
});

describe('模块用的模型：目录读口', () => {
  it('★ 按服务商分组：读不出来的一家跳过，空目录也不占一格，默认模型一起带上', async () => {
    const ctx = ctxOf({
      llm: llmOf({
        providers: [
          { id: 'deepseek', name: 'DeepSeek' },
          { id: 'broken', name: '坏了的那家' },
          { id: 'empty', name: '空目录' },
        ],
        models: {
          deepseek: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
          ],
          broken: new Error('目录没读出来'),
          empty: [],
        },
      }),
      agentDefaultModel: defaultModelOf_({ provider: 'deepseek', model: 'deepseek-chat' }),
    });

    expect(await moduleModelCatalogOf(ctx)).toEqual({
      groups: [
        {
          id: 'deepseek',
          name: 'DeepSeek',
          models: [
            { id: 'deepseek-chat', name: 'DeepSeek Chat' },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
          ],
        },
      ],
      default: { provider: 'deepseek', model: 'deepseek-chat' },
    });
  });

  it('没有模型端口时给空分组，不假装有模型', async () => {
    expect(await moduleModelCatalogOf(ctxOf({}))).toEqual({ groups: [], default: null });
  });

  it('★ 路由带回 ok: true（取数层只认 ok 的响应，少一个字段界面就一直 loading）', async () => {
    const routes: Record<string, () => unknown> = {};
    mountModuleModels({
      ctx: ctxOf({
        llm: llmOf({ providers: [{ id: 'p', name: 'P' }], models: { p: [{ id: 'm', name: 'M' }] } }),
      }),
      routes: routes as never,
    });

    expect(await routes['workbench-module-models']?.()).toEqual({
      ok: true,
      groups: [{ id: 'p', name: 'P', models: [{ id: 'm', name: 'M' }] }],
      default: null,
    });
  });
});
