import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { en, zh } from '@dsh-workbench/shared';
import type { SettingsItemId } from '../workbench-settings/settings-registry';
import {
  SETTINGS_GROUPS,
  SETTINGS_ITEMS,
  settingsEffectText,
  settingsGroupLeadKey,
  settingsGroupTitleKey,
  settingsItemsOf,
} from '../workbench-settings/settings-registry';

const t: Translate = (key) => key;

const NAV_KEYS: Readonly<Record<SettingsItemId, string>> = {
  sidebarEdition: 'sidebarEdition.nav',
  moduleModel: 'moduleModel.nav',
  mcpOnDemand: 'mcpOnDemand.nav',
  diyPresetSource: 'diyPresetSource.nav',
  prereleaseChannels: 'updatePrerelease.nav',
};

describe('设置 registry：一处登记，页面按它分组', () => {
  it('★ 每个设置项只属于一个存在的组', () => {
    const ids = new Set(SETTINGS_GROUPS);
    for (const item of SETTINGS_ITEMS) expect(ids.has(item.group)).toBe(true);
    expect(new Set(SETTINGS_ITEMS.map((item) => item.id)).size).toBe(SETTINGS_ITEMS.length);
  });

  it('★ 每个组都有内容，顺序就是页面上的顺序', () => {
    expect(SETTINGS_GROUPS).toEqual(['look', 'tools', 'modules']);
    for (const group of SETTINGS_GROUPS) expect(settingsItemsOf(group).length).toBeGreaterThan(0);
  });

  it('★ 生效时机只落在那三种说法上，中英文都齐', () => {
    const keys = new Set(SETTINGS_ITEMS.map((item) => settingsEffectText(t, item)));
    expect([...keys].sort()).toEqual([
      'workbenchSettings.effect.autoReload',
      'workbenchSettings.effect.immediate',
      'workbenchSettings.effect.newSession',
    ]);
    for (const key of keys) {
      expect(zh[key as keyof typeof zh]).toBeDefined();
      expect(en[key as keyof typeof en]).toBeDefined();
    }
  });

  it('★ 每个设置项都有标题文案，中英文都在', () => {
    for (const item of SETTINGS_ITEMS) {
      expect(zh[NAV_KEYS[item.id] as keyof typeof zh]).toBeDefined();
      expect(en[NAV_KEYS[item.id] as keyof typeof en]).toBeDefined();
    }
  });

  it('分组的标题与说明在中英文里都有', () => {
    for (const group of SETTINGS_GROUPS) {
      expect(zh[settingsGroupTitleKey(group) as keyof typeof zh]).toBeDefined();
      expect(zh[settingsGroupLeadKey(group) as keyof typeof zh]).toBeDefined();
      expect(en[settingsGroupTitleKey(group) as keyof typeof en]).toBeDefined();
      expect(en[settingsGroupLeadKey(group) as keyof typeof en]).toBeDefined();
    }
  });
});
