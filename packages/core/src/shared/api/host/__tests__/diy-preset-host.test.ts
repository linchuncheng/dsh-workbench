import { describe, expect, it, vi } from 'vitest';
import type {
  DshAgentPresetDefinition,
  DshAgentPresetRegistry,
  DshAgentPresetUnregister,
  DshHostContext,
} from '@dsh-workbench/shared/host';
import type { WorkbenchSettings } from '@/kernel/contract/workbench-settings';
import { mountDiyPreset } from '../diy-preset-host';
import type { WorkbenchSettingsStore } from '../workbench-settings';

const STANDARD = {
  id: 'standard',
  order: 1,
  plugins: [
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  ],
};

const CUSTOM = {
  id: 'my-mode',
  order: 2,
  plugins: [
    { id: 'tool-mine', name: '@dsh-workbench/module-mine' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  ],
};

type RegisterFn = (definition: DshAgentPresetDefinition) => Promise<DshAgentPresetUnregister>;

function settingsOf(source: string): WorkbenchSettingsStore & { set(next: string): void } {
  let current: WorkbenchSettings = {
    mcpOnDemand: false,
    includePrerelease: false,
    prereleaseChannels: [],
    moduleModel: null,
    diyPresetSource: source,
  };
  const listeners = new Set<(settings: WorkbenchSettings) => void>();
  return {
    read: () => current,
    apply: () => ({ ok: true, settings: current }),
    watch(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next) {
      current = { ...current, diyPresetSource: next };
      for (const listener of [...listeners]) listener(current);
    },
  };
}

function ctxOf(options: {
  readonly register: RegisterFn;
  readonly loader: unknown;
}): { ctx: DshHostContext; cleanups: (() => void)[] } {
  const cleanups: (() => void)[] = [];
  const registry: DshAgentPresetRegistry = {
    list: async () => [],
    register: options.register,
  };
  const ctx = {
    get: (name: string) =>
      name === 'agentPresets' ? registry : name === 'loader' ? options.loader : undefined,
    effect: (effect: () => void | (() => void)) => {
      const off = effect();
      if (typeof off === 'function') cleanups.push(off);
      return () => undefined;
    },
    logger: { warn: vi.fn(), info: vi.fn() },
  } as unknown as DshHostContext;
  return { ctx, cleanups };
}

const loaderOf = (...configs: unknown[]) => ({
  entries: () =>
    configs.map((config, index) => ({
      id: `include:preset-${index}`,
      options: { name: '@deepseek-ai/dsh-agent-preset', config },
    })),
});

const flush = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

const registeredIds = (definition: DshAgentPresetDefinition): readonly unknown[] =>
  definition.plugins.map((row) => (row as { id?: string }).id);

describe('mountDiyPreset（设置 → 路由 → 注册的一条线）', () => {
  it('★ 挂上来源列表路由，并按设置里选中的模式注册 DIY', async () => {
    const register = vi.fn<RegisterFn>(async () => async () => undefined);
    const settings = settingsOf('my-mode');
    const { ctx, cleanups } = ctxOf({ register, loader: loaderOf(STANDARD, CUSTOM) });
    const routes: Record<string, () => unknown> = {};

    mountDiyPreset({ ctx, routes, settings });
    expect(typeof routes['workbench-diy-presets']).toBe('function');
    await flush();

    const definition = register.mock.calls[0]?.[0] as DshAgentPresetDefinition;
    expect(registeredIds(definition)).toContain('tool-mine');
    const snapshot = (await routes['workbench-diy-presets']?.()) as {
      sources: readonly { id: string }[];
    };
    expect(snapshot.sources.map((source) => source.id)).toEqual(['standard', 'my-mode']);
    expect(cleanups).toHaveLength(1);
  });

  it('★ 设置改了就走同一条链重新派生；卸载时收干净', async () => {
    const off = vi.fn(async () => undefined);
    const register = vi.fn<RegisterFn>(async () => off);
    const settings = settingsOf('standard');
    const { ctx, cleanups } = ctxOf({ register, loader: loaderOf(STANDARD, CUSTOM) });

    mountDiyPreset({ ctx, routes: {}, settings });
    await flush();
    expect(register).toHaveBeenCalledTimes(1);

    settings.set('my-mode');
    await flush();
    expect(register).toHaveBeenCalledTimes(2);
    const second = register.mock.calls[1]?.[0] as DshAgentPresetDefinition;
    expect(registeredIds(second)).toContain('tool-mine');

    cleanups[0]?.();
    await flush();
    expect(off).toHaveBeenCalledTimes(2);
  });
});
