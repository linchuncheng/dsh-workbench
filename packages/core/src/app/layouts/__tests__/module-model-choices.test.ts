import { describe, expect, it } from 'vitest';
import {
  moduleModelChoiceOf,
  moduleModelChoicesOf,
  moduleModelLabelOf,
  moduleModelValueOf,
} from '../workbench-settings/module-model-choices';

const groups = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
  },
  { id: 'relay', name: '中转', models: [{ id: 'openai/gpt-4o', name: 'GPT-4o' }] },
];

describe('模块用的模型：下拉候选与取值', () => {
  it('★ 值能原样带回选中的 provider / model，模型 id 里带斜杠也不串位', () => {
    const choice = { provider: 'relay', model: 'openai/gpt-4o' };
    const value = moduleModelValueOf(choice);

    expect(moduleModelChoiceOf(value)).toEqual(choice);
    expect(moduleModelChoiceOf('')).toBeUndefined();
    expect(moduleModelChoiceOf('没有斜杠')).toBeUndefined();
    expect(moduleModelChoiceOf('%E0%A4%A/x')).toBeUndefined();
  });

  it('★ 第一条是默认；其余按服务商分组，选中哪条由存下来的值定', () => {
    const chosen = moduleModelChoicesOf({
      groups,
      stored: { provider: 'relay', model: 'openai/gpt-4o' },
      followLabel: '默认',
      savedLabel: '',
    });

    expect(chosen.options.map((option) => option.value)).toEqual([
      '',
      moduleModelValueOf({ provider: 'deepseek', model: 'deepseek-chat' }),
      moduleModelValueOf({ provider: 'deepseek', model: 'deepseek-reasoner' }),
      moduleModelValueOf({ provider: 'relay', model: 'openai/gpt-4o' }),
    ]);
    expect(chosen.options.map((option) => option.group)).toEqual([undefined, 'DeepSeek', 'DeepSeek', '中转']);
    expect(chosen.selected).toBe(moduleModelValueOf({ provider: 'relay', model: 'openai/gpt-4o' }));

    const unset = moduleModelChoicesOf({ groups, stored: null, followLabel: '默认', savedLabel: '' });
    expect(unset.selected).toBe('');
    expect(unset.options).toHaveLength(4);
  });

  it('★ 存着的模型不在目录里：留一条禁用的当前值，选中它还看得见', () => {
    const stored = { provider: 'gone', model: 'model-x' };
    const chosen = moduleModelChoicesOf({
      groups,
      stored,
      followLabel: '默认',
      savedLabel: 'Gone / model-x（不可用）',
    });

    const saved = chosen.options[chosen.options.length - 1];
    expect(saved).toEqual({
      value: moduleModelValueOf(stored),
      label: 'Gone / model-x（不可用）',
      disabled: true,
      searchText: 'gone model-x',
    });
    expect(chosen.selected).toBe(moduleModelValueOf(stored));
  });

  it('目录为空时只剩默认这一条', () => {
    const chosen = moduleModelChoicesOf({ groups: [], stored: null, followLabel: '默认', savedLabel: '' });
    expect(chosen.options).toEqual([{ value: '', label: '默认' }]);
    expect(chosen.selected).toBe('');
  });

  it('给人看的标签先找服务商名与模型名，找不到就用 id', () => {
    expect(moduleModelLabelOf(groups, { provider: 'deepseek', model: 'deepseek-chat' })).toBe(
      'DeepSeek/DeepSeek Chat',
    );
    expect(moduleModelLabelOf(groups, { provider: 'gone', model: 'm' })).toBe('gone/m');
    expect(moduleModelLabelOf(groups, { provider: 'relay', model: 'other' })).toBe('中转/other');
  });
});
