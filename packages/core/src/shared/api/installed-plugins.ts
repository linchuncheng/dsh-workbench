export const INSTALLED_PLUGINS_ROUTE = 'panels/plugins';

export interface InstalledPlugin {
  readonly pkg: string;
  readonly name?: string;
  readonly installed?: string;
  readonly latest?: string;
  readonly local?: boolean;
  readonly broken?: boolean;
  readonly registry?: string;
  readonly installedAt?: string;
  readonly runtimeProblem?:
    | { readonly label: string; readonly need: string; readonly have: string }
    | undefined;
}

export interface InstalledPluginsPayload {
  readonly plugins: readonly InstalledPlugin[];
}
