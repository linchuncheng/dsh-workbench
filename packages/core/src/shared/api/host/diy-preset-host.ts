import type { DshHostContext, RouteTable } from '@dsh-workbench/shared/host';
import { registerDiyPreset } from './diy-preset';
import { mountDiyPresetSources } from './diy-preset-sources';
import type { WorkbenchSettingsStore } from './workbench-settings';

export function mountDiyPreset(options: {
  readonly ctx: DshHostContext;
  readonly routes: RouteTable;
  readonly settings: WorkbenchSettingsStore;
}): void {
  mountDiyPresetSources({ ctx: options.ctx, routes: options.routes });
  registerDiyPreset(options.ctx, {
    current: () => options.settings.read().diyPresetSource,
    watch: (listener) => options.settings.watch(() => listener()),
  });
}
