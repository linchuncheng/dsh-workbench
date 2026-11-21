import { describe, expect, it } from 'vitest';
import { zh } from '@dsh-workbench/shared';
import type { WorkbenchDiyPresetSource } from '@/kernel/contract/workbench-settings';
import { diyPresetChoicesOf, diyPresetLabelOf } from '../workbench-settings/diy-preset-choices';

const t = (key: string, params?: Record<string, unknown>): string => {
  let text = (zh as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value));
  return text;
};

const source = (overrides: Partial<WorkbenchDiyPresetSource> = {}): WorkbenchDiyPresetSource => ({
  id: 'standard',
  name: null,
  description: null,
  usable: true,
  ...overrides,
});

describe('DIY 来源下拉的选项', () => {
  it('★ dsh 出厂的几个模式没有 name：按 id 给中文名，未知 id 用原 id', () => {
    expect(diyPresetLabelOf(t, source())).toBe('标准模式');
    expect(diyPresetLabelOf(t, source({ id: 'ptc' }))).toBe('PTC 模式');
    expect(diyPresetLabelOf(t, source({ id: 'mine' }))).toBe('mine');
  });

  it('★ 自己命名的模式照原名显示（不被内置词表盖掉）', () => {
    expect(diyPresetLabelOf(t, source({ id: 'standard', name: '公司标准' }))).toBe('公司标准');
  });

  it('不可用的来源标出来并禁选；可用的能选', () => {
    const choices = diyPresetChoicesOf({
      t,
      sources: [source(), source({ id: 'broken', name: '坏的', usable: false })],
      stored: 'standard',
    });
    expect(choices.selected).toBe('standard');
    expect(choices.unavailable).toBe(false);
    expect(choices.options.map((option) => [option.value, option.label, option.disabled])).toEqual([
      ['standard', '标准模式', undefined],
      ['broken', '坏的（不可用）', true],
    ]);
  });

  it('★ 存着的来源不在名单里：补一条禁选的「不可用」，别把值悄悄换掉', () => {
    const choices = diyPresetChoicesOf({
      t,
      sources: [source()],
      stored: 'deleted-mode',
    });
    expect(choices.selected).toBe('deleted-mode');
    expect(choices.unavailable).toBe(true);
    expect(choices.options.at(-1)).toEqual({
      value: 'deleted-mode',
      label: 'deleted-mode（不可用）',
      disabled: true,
      searchText: 'deleted-mode',
    });
  });

  it('★ 存着的来源还在但坏了：同样算不可用', () => {
    const choices = diyPresetChoicesOf({
      t,
      sources: [source({ id: 'mine', name: '我的模式', usable: false })],
      stored: 'mine',
    });
    expect(choices.unavailable).toBe(true);
  });
});
