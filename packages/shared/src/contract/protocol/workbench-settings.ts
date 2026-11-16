export const WORKBENCH_SETTINGS_ROUTE = 'workbench-settings';

export const WORKBENCH_SETTINGS_RESOURCE = 'workbenchSettings';

export const WORKBENCH_MODULE_MODELS_ROUTE = 'workbench-module-models';

export interface WorkbenchModelChoice {
  readonly provider: string;
  readonly model: string;
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
}

export interface WorkbenchModuleModelsSnapshot {
  readonly groups: readonly WorkbenchModelGroup[];
  readonly default: WorkbenchModelChoice | null;
}
