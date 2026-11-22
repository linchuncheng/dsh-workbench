import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const section = readFileSync(new URL('workbench-settings/WorkbenchSettingsSection.tsx', HERE), 'utf8');

const at = (needle: string): number => section.indexOf(needle);

describe('设置页：一行一个设置，整份配置的操作收在「高级」', () => {
  it('★ 设置行按固定顺序排，中间不插分组标题', () => {
    expect(at('<SidebarEditionItem')).toBeGreaterThan(-1);
    expect(at('{settingsPickRows(t)}')).toBeGreaterThan(at('<SidebarEditionItem'));
    expect(at('<McpOnDemandItem')).toBeGreaterThan(at('{settingsPickRows(t)}'));
    expect(at('<UpdatePrereleaseItem')).toBeGreaterThan(at('<McpOnDemandItem'));
    expect(at("t('workbenchSettings.advanced')")).toBeGreaterThan(at('<UpdatePrereleaseItem'));
  });

  it('★ 配置同步与新建工作台都在「高级」里', () => {
    const advanced = section.slice(at("t('workbenchSettings.advanced')"));
    expect(advanced).toContain('<ConfigSyncItem');
    expect(advanced).toContain('<NewWorkbenchItem');
  });

  it('★ 只放设置与配置操作：不放只读信息，也不另起分组', () => {
    expect(section).not.toContain('AdapterSetItem');
    expect(section).not.toContain('WorkbenchFacts');
    expect(section).not.toContain('SettingsGroup');
  });
});
