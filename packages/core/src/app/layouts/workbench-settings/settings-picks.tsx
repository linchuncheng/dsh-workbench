import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import type { SelectFieldOption, Translate } from '@dsh-workbench/shared';
import type {
  WorkbenchDiyPresetsSnapshot,
  WorkbenchModuleModelsSnapshot,
  WorkbenchSettings,
} from '@/kernel/contract/workbench-settings';
import {
  WORKBENCH_DIY_PRESETS_ROUTE,
  WORKBENCH_MODULE_MODELS_ROUTE,
} from '@/kernel/contract/workbench-settings';
import { diyPresetChoicesOf } from './diy-preset-choices';
import {
  moduleModelChoiceOf,
  moduleModelChoicesOf,
  moduleModelLabelOf,
  moduleModelValueOf,
} from './module-model-choices';
import type { SettingsPickItemProps, SettingsPickView } from './SettingsPickItem';
import { SettingsPickItem } from './SettingsPickItem';

type PickCatalog = WorkbenchModuleModelsSnapshot | WorkbenchDiyPresetsSnapshot;

interface PickInput {
  readonly t: Translate;
  readonly catalog: PickCatalog | undefined;
  readonly stored: string;
}

interface SettingsPickSpec {
  readonly id: 'moduleModel' | 'diyPresetSource';
  readonly route: string;
  readonly settingsFailedKey: string;
  readonly emptyKey?: string | undefined;
  readonly unavailable?: boolean | undefined;
  readonly incomplete?: ((catalog: PickCatalog | undefined) => boolean) | undefined;
  readonly renderValue?: ((t: Translate) => (option: SelectFieldOption | undefined) => ReactNode) | undefined;
  readonly storedOf: (settings: WorkbenchSettings) => string;
  readonly requestOf: (value: string) => Record<string, unknown>;
  readonly viewOf: (input: PickInput) => SettingsPickView;
}

function moduleModelView({ t, catalog, stored }: PickInput): SettingsPickView {
  const found = catalog !== undefined && 'groups' in catalog ? catalog : undefined;
  const groups = found?.groups ?? [];
  const fallback = found?.default ?? null;
  const choice = stored === '' ? null : (moduleModelChoiceOf(stored) ?? null);
  const followLabel =
    fallback === null
      ? t('moduleModel.followDefault')
      : t('moduleModel.followDefaultNamed', { target: moduleModelLabelOf(groups, fallback) });
  const { options, selected } = moduleModelChoicesOf({
    groups,
    stored: choice,
    followLabel,
    savedLabel:
      choice === null
        ? ''
        : t('moduleModel.unavailable', { target: moduleModelLabelOf(groups, choice) }),
  });
  return { options, selected, unavailable: false };
}

function diyPresetSourceView({ t, catalog, stored }: PickInput): SettingsPickView {
  const sources = catalog !== undefined && 'sources' in catalog ? catalog.sources : [];
  return diyPresetChoicesOf({ t, sources, stored });
}

const SPECS: readonly SettingsPickSpec[] = [
  {
    id: 'moduleModel',
    route: WORKBENCH_MODULE_MODELS_ROUTE,
    settingsFailedKey: 'workbenchSettings.readFailed',
    renderValue: (t) => (option) =>
      option?.value === '' ? t('moduleModel.followDefault') : option?.label,
    storedOf: (settings) =>
      settings.moduleModel === null ? '' : moduleModelValueOf(settings.moduleModel),
    requestOf: (value) => ({ moduleModel: moduleModelChoiceOf(value) ?? null }),
    viewOf: moduleModelView,
  },
  {
    id: 'diyPresetSource',
    route: WORKBENCH_DIY_PRESETS_ROUTE,
    settingsFailedKey: 'workbenchSettings.readFailed',
    emptyKey: 'diyPresetSource.empty',
    unavailable: true,
    incomplete: (catalog) => catalog !== undefined && 'ready' in catalog && !catalog.ready,
    storedOf: (settings) => settings.diyPresetSource,
    requestOf: (value) => ({ diyPresetSource: value }),
    viewOf: diyPresetSourceView,
  },
];

function propsOf(spec: SettingsPickSpec, t: Translate): SettingsPickItemProps<PickCatalog> {
  const key = (suffix: string): string => `${spec.id}.${suffix}`;
  return {
    t,
    title: t(key('nav')),
    description: t(key('lead')),
    catalogRoute: spec.route,
    settingsFailedText: t(spec.settingsFailedKey),
    catalogFailedText: t(key('readFailed')),
    saveFailedText: t(key('failed')),
    loadingText: t(key('reading')),
    searchPlaceholder: t(key('search')),
    ...(spec.emptyKey === undefined ? {} : { emptyText: t(spec.emptyKey) }),
    ...(spec.unavailable === true ? { unavailableNote: t(key('storedUnavailable')) } : {}),
    ...(spec.renderValue === undefined ? {} : { renderValue: spec.renderValue(t) }),
    ...(spec.incomplete === undefined ? {} : { incomplete: spec.incomplete }),
    storedOf: spec.storedOf,
    requestOf: spec.requestOf,
    viewOf: spec.viewOf,
  };
}

export function settingsPickRows(t: Translate): readonly JSX.Element[] {
  return SPECS.map((spec) => <SettingsPickItem<PickCatalog> key={spec.id} {...propsOf(spec, t)} />);
}
