import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const section = readFileSync(new URL('workbench-settings/WorkbenchSettingsSection.tsx', HERE), 'utf8');

const at = (needle: string): number => section.indexOf(needle);

describe('设置页顺序：先设置组，再整份配置，最后环境与诊断', () => {
  it('★ 三个设置组由 registry 渲染，排在两个操作组之前', () => {
    expect(at('SETTINGS_GROUPS.map')).toBeGreaterThan(-1);
    expect(at("t('workbenchSettings.wholesale')")).toBeGreaterThan(at('SETTINGS_GROUPS.map'));
    expect(at("t('workbenchSettings.environment')")).toBeGreaterThan(
      at("t('workbenchSettings.wholesale')"),
    );
  });

  it('★ 配置同步与新建工作台留在「整个工作台的配置」组里', () => {
    const wholesale = section.slice(
      at("t('workbenchSettings.wholesale')"),
      at("t('workbenchSettings.environment')"),
    );
    expect(wholesale).toContain('<ConfigSyncItem');
    expect(wholesale).toContain('<NewWorkbenchItem');
  });

  it('★ 环境与诊断里是只读信息：适配组件、身份与版本', () => {
    const environment = section.slice(at("t('workbenchSettings.environment')"));
    expect(environment).toContain('<AdapterSetItem');
    expect(environment).toContain('<WorkbenchFacts');
  });
});
