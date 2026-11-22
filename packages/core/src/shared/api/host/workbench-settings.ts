import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { PostResource, RouteTable } from '@dsh-workbench/shared/host';
import { writeJsonFile } from '@dsh-workbench/shared/host';
import type {
  PrereleaseChannel,
  WorkbenchModelChoice,
  WorkbenchSettings,
  WorkbenchSettingsApplied,
  WorkbenchSettingsRequest,
} from '@/kernel/contract/workbench-settings';
import { PRERELEASE_CHANNELS } from '@/kernel/contract/workbench-settings';
import { WORKBENCH_SETTINGS_RESOURCE, WORKBENCH_SETTINGS_ROUTE } from '@/kernel/contract/workbench-settings';
import { DIY_PRESET_SOURCE_DEFAULT } from '@/kernel/contract/diy';

export { WORKBENCH_SETTINGS_ROUTE } from '@/kernel/contract/workbench-settings';

export const WORKBENCH_SETTINGS_SERVICE = 'workbenchSettingsStore';

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = {
  mcpOnDemand: false,
  includePrerelease: false,
  prereleaseChannels: [],
  moduleModel: null,
  diyPresetSource: DIY_PRESET_SOURCE_DEFAULT,
};

export interface WorkbenchSettingsStore {
  read(): WorkbenchSettings;
  apply(payload: unknown): WorkbenchSettingsApplied;
  watch(listener: (settings: WorkbenchSettings) => void): () => void;
}

function booleanOf(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function textOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isChannel(value: unknown): value is PrereleaseChannel {
  return typeof value === 'string' && (PRERELEASE_CHANNELS as readonly string[]).includes(value);
}

function channelsOf(value: unknown): readonly PrereleaseChannel[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const picked = new Set<PrereleaseChannel>();
  for (const one of value) {
    if (!isChannel(one)) return undefined;
    picked.add(one);
  }
  return PRERELEASE_CHANNELS.filter((channel) => picked.has(channel));
}

function modelChoiceOf(value: unknown): WorkbenchModelChoice | null | undefined {
  if (value === null) return null;
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
  if (record === undefined) return undefined;
  const provider = textOf(record['provider']);
  const model = textOf(record['model']);
  return provider === undefined || model === undefined ? undefined : { provider, model };
}

function sameChoice(left: WorkbenchModelChoice | null, right: WorkbenchModelChoice | null): boolean {
  if (left === null || right === null) return left === right;
  return left.provider === right.provider && left.model === right.model;
}

function settingsOf(raw: unknown): WorkbenchSettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const legacy = booleanOf(record['includePrerelease']) === true;
  const prereleaseChannels =
    channelsOf(record['prereleaseChannels']) ?? (legacy ? (['rc'] as const) : []);
  return {
    mcpOnDemand: booleanOf(record['mcpOnDemand']) ?? DEFAULT_WORKBENCH_SETTINGS.mcpOnDemand,
    includePrerelease: prereleaseChannels.length > 0,
    prereleaseChannels,
    moduleModel: modelChoiceOf(record['moduleModel']) ?? null,
    diyPresetSource: textOf(record['diyPresetSource']) ?? DEFAULT_WORKBENCH_SETTINGS.diyPresetSource,
  };
}

function storedOf(settings: WorkbenchSettings): Record<string, unknown> {
  return {
    mcpOnDemand: settings.mcpOnDemand,
    includePrerelease: settings.prereleaseChannels.length > 0,
    prereleaseChannels: settings.prereleaseChannels,
    ...(settings.moduleModel === null
      ? {}
      : { moduleModel: { provider: settings.moduleModel.provider, model: settings.moduleModel.model } }),
    diyPresetSource: settings.diyPresetSource,
  };
}

export function createWorkbenchSettingsStore(options: { readonly root: string }): WorkbenchSettingsStore {
  const file = join(options.root, 'settings.json');
  const listeners = new Set<(settings: WorkbenchSettings) => void>();
  let cached: WorkbenchSettings | undefined;

  const read = (): WorkbenchSettings => {
    if (cached !== undefined) return cached;
    try {
      cached = settingsOf(JSON.parse(readFileSync(file, 'utf8')) as unknown);
    } catch {
      cached = DEFAULT_WORKBENCH_SETTINGS;
    }
    return cached;
  };

  return {
    read,
    apply(payload) {
      const request = (typeof payload === 'object' && payload !== null ? payload : {}) as WorkbenchSettingsRequest;
      const current = read();
      const requestedModel = request.moduleModel === undefined ? current.moduleModel : modelChoiceOf(request.moduleModel);
      if (requestedModel === undefined) {
        throw new Error('moduleModel 要是 { provider, model }，或者 null');
      }
      if (request.mcpOnDemand !== undefined && booleanOf(request.mcpOnDemand) === undefined) {
        throw new Error('mcpOnDemand 要是 true / false');
      }
      if (request.includePrerelease !== undefined && booleanOf(request.includePrerelease) === undefined) {
        throw new Error('includePrerelease 要是 true / false');
      }
      if (request.prereleaseChannels !== undefined && channelsOf(request.prereleaseChannels) === undefined) {
        throw new Error(`预发布通道只能是 ${PRERELEASE_CHANNELS.join(' / ')}`);
      }
      const requestedChannels =
        request.prereleaseChannels === undefined
          ? request.includePrerelease === undefined
            ? current.prereleaseChannels
            : booleanOf(request.includePrerelease) === true
              ? (['rc'] as const)
              : []
          : (channelsOf(request.prereleaseChannels) ?? []);
      const requestedSource =
        request.diyPresetSource === undefined ? current.diyPresetSource : textOf(request.diyPresetSource);
      if (requestedSource === undefined) {
        throw new Error('无法保存设置：DIY 模式必须从一个模式继承。');
      }
      const next: WorkbenchSettings = {
        mcpOnDemand: booleanOf(request.mcpOnDemand) ?? current.mcpOnDemand,
        includePrerelease: requestedChannels.length > 0,
        prereleaseChannels: requestedChannels,
        moduleModel: requestedModel,
        diyPresetSource: requestedSource,
      };
      const changed =
        next.mcpOnDemand !== current.mcpOnDemand ||
        next.prereleaseChannels.join(',') !== current.prereleaseChannels.join(',') ||
        !sameChoice(next.moduleModel, current.moduleModel) ||
        next.diyPresetSource !== current.diyPresetSource;
      if (changed) writeJsonFile(file, storedOf(next));
      cached = next;
      if (changed) for (const listener of [...listeners]) listener(next);
      return { ok: true, settings: next };
    },
    watch(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function mountWorkbenchSettings(options: {
  readonly ctx: DshHostContext;
  readonly routes: RouteTable;
  readonly root: string;
}): WorkbenchSettingsStore {
  const store = createWorkbenchSettingsStore({ root: options.root });
  options.ctx.provide(WORKBENCH_SETTINGS_SERVICE, store);
  options.routes[WORKBENCH_SETTINGS_ROUTE] = () => ({ ok: true, settings: store.read() });
  return store;
}

export function workbenchSettingsAction(store: WorkbenchSettingsStore): PostResource {
  return {
    resource: WORKBENCH_SETTINGS_RESOURCE,
    handle: (payload: unknown) => store.apply(payload),
  };
}
