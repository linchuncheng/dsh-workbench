import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const section = readFileSync(new URL('workbench-settings/WorkbenchSettingsSection.tsx', HERE), 'utf8');

const at = (needle: string): number => section.indexOf(needle);

describe('设置页顺序：先设置组，再整份配置', () => {
  it('★ 三个设置组由 registry 渲染，排在整份配置之前', () => {
    expect(at('SETTINGS_GROUPS.map')).toBeGreaterThan(-1);
    expect(at("t('workbenchSettings.wholesale')")).toBeGreaterThan(at('SETTINGS_GROUPS.map'));
  });

  it('★ 配置同步与新建工作台留在「整个工作台的配置」组里', () => {
    const wholesale = section.slice(at("t('workbenchSettings.wholesale')"));
    expect(wholesale).toContain('<ConfigSyncItem');
    expect(wholesale).toContain('<NewWorkbenchItem');
  });

  it('★ 只放设置与配置操作：不放只读信息', () => {
    expect(section).not.toContain('AdapterSetItem');
    expect(section).not.toContain('WorkbenchFacts');
    expect(section).not.toContain('workbenchSettings.environment');
  });
});
