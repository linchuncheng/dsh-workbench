import type { Translate } from '@dsh-workbench/shared';

export type SettingsGroupId = 'look' | 'tools' | 'modules';

export type SettingsEffect = 'immediate' | 'auto-reload' | 'new-session';

export type SettingsItemId =
  | 'sidebarEdition'
  | 'moduleModel'
  | 'mcpOnDemand'
  | 'diyPresetSource'
  | 'prereleaseChannels';

export interface SettingsItem {
  readonly id: SettingsItemId;
  readonly group: SettingsGroupId;
  readonly effect: SettingsEffect;
}

export const SETTINGS_GROUPS: readonly SettingsGroupId[] = ['look', 'tools', 'modules'];

export const SETTINGS_ITEMS: readonly SettingsItem[] = [
  { id: 'sidebarEdition', group: 'look', effect: 'auto-reload' },
  { id: 'moduleModel', group: 'look', effect: 'immediate' },
  { id: 'mcpOnDemand', group: 'tools', effect: 'immediate' },
  { id: 'diyPresetSource', group: 'tools', effect: 'new-session' },
  { id: 'prereleaseChannels', group: 'modules', effect: 'immediate' },
];

const EFFECT_KEYS: Readonly<Record<SettingsEffect, string>> = {
  immediate: 'workbenchSettings.effect.immediate',
  'auto-reload': 'workbenchSettings.effect.autoReload',
  'new-session': 'workbenchSettings.effect.newSession',
};

export function settingsGroupTitleKey(group: SettingsGroupId): string {
  return `workbenchSettings.group.${group}`;
}

export function settingsGroupLeadKey(group: SettingsGroupId): string {
  return `workbenchSettings.group.${group}.lead`;
}

export function settingsItemsOf(group: SettingsGroupId): readonly SettingsItem[] {
  return SETTINGS_ITEMS.filter((item) => item.group === group);
}

export function settingsEffectText(t: Translate, item: SettingsItem): string {
  return t(EFFECT_KEYS[item.effect]);
}
