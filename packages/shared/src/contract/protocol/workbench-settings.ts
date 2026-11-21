export const WORKBENCH_SETTINGS_ROUTE = 'workbench-settings';

export const WORKBENCH_SETTINGS_RESOURCE = 'workbenchSettings';

export const WORKBENCH_MODULE_MODELS_ROUTE = 'workbench-module-models';

export const WORKBENCH_DIY_PRESETS_ROUTE = 'workbench-diy-presets';

export interface WorkbenchModelChoice {
  readonly provider: string;
  readonly model: string;
}

export interface WorkbenchDiyPresetSource {
  readonly id: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly usable: boolean;
}

export interface WorkbenchDiyPresetsSnapshot {
  readonly ready: boolean;
  readonly sources: readonly WorkbenchDiyPresetSource[];
}

export interface WorkbenchModelRef {
  readonly id: string;
  readonly name: string;
}

export interface WorkbenchModelGroup {
  readonly id: string;
  readonly name: string;
  readonly models: readonly WorkbenchModelRef[];
}

export interface WorkbenchSettings {
  readonly mcpOnDemand: boolean;
  readonly includePrerelease: boolean;
  readonly moduleModel: WorkbenchModelChoice | null;
  readonly diyPresetSource: string;
}

export interface WorkbenchSettingsSnapshot {
  readonly settings: WorkbenchSettings;
}

export interface WorkbenchSettingsApplied {
  readonly ok: true;
  readonly settings: WorkbenchSettings;
}

export interface WorkbenchSettingsRequest {
  readonly mcpOnDemand?: boolean;
  readonly includePrerelease?: boolean;
  readonly moduleModel?: WorkbenchModelChoice | null;
  readonly diyPresetSource?: string;
}

export interface WorkbenchModuleModelsSnapshot {
  readonly groups: readonly WorkbenchModelGroup[];
  readonly default: WorkbenchModelChoice | null;
}
