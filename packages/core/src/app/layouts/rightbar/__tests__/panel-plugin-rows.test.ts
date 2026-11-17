import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { selectPanelRows } from '../board-selection';
import type { PanelPluginUnit, PanelUnit } from '../use-panels';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const MODULE: PanelUnit = {
  id: 'issues',
  titleKey: 'issues.mine',
  shown: true,
  source: 'user',
  hasCard: true,
};

const PLUGIN: PanelPluginUnit = {
  id: 'plugin:opencli-plugin-inventory',
  pkg: 'opencli-plugin-inventory',
  title: 'inventory',
  shown: false,
  source: 'default',
};

const BROKEN: CapabilityMap = {
  issues: {
    unit: 'issues',
    status: 'missing',
    needs: [{ id: 'extension:demo', kind: 'extension', name: 'demo', status: 'missing', detail: '' }],
  },
};

describe('面板配置那一屏的行：模块 + 插件行', () => {
  it('★ 插件行不过能力那道过滤（模块因为"没装好"被筛掉时，插件行照旧在）', () => {
    const rows = selectPanelRows([MODULE], [PLUGIN], BROKEN);

    expect(rows.map((row) => row.id)).toEqual([PLUGIN.id]);
    expect(rows[0]).toEqual({
      id: PLUGIN.id,
      title: 'inventory',
      plugin: true,
      shown: false,
      source: 'default',
    });
  });

  it('没有能力表（还没探到）时插件行也在', () => {
    const rows = selectPanelRows([MODULE], [PLUGIN], null);

    expect(rows.map((row) => row.id)).toEqual([MODULE.id, PLUGIN.id]);
    expect(rows[0]?.plugin).toBe(false);
    expect(rows[0]?.titleKey).toBe('issues.mine');
  });

  it('★ 插件行用字面标题（i18n 词典里没有它的键），模块行还是走 titleKey', () => {
    const view = `${read('PanelGroupRows.tsx')}\n${read('ModulesPage.tsx')}`;

    expect(view).toContain('row.title ?? t(row.titleKey ?? row.id)');
    expect(view).toContain('titleKey="panels.groupBackground"');
    expect(view).not.toContain('t(row.id)');
  });

  it('★ 插件行不参与拖动排序（它没有卡片，排的是卡片）；模块行照旧可拖', () => {
    const groups = read('PanelGroupRows.tsx');

    expect(groups).not.toContain('draggable');
    expect(groups).not.toContain("action: 'move'");
    expect(read('ModulesPage.tsx')).toContain("action: 'move'");
  });

  it('★ 两组：带卡片的（可拖）在前，没卡片的与插件合成「后台模块」—— 用户只区分"有界面 / 没界面"', () => {
    const page = read('ModulesPage.tsx');
    const groups = read('PanelGroupRows.tsx');

    expect(page).toContain('const carded: PanelRow[] = modules.filter((row) => row.hasCard !== false)');
    expect(page).toContain('const background: PanelRow[] = rows.filter((row) => row.plugin || row.hasCard === false)');
    expect(page).toContain('titleKey="panels.groupBackground"');
    expect(page).toContain('kind="background"');
    expect(page).not.toContain('panels.groupBoardless');
    expect(page).not.toContain('panels.groupPlugins');
    expect(groups).toContain('<h3 className={styles.groupTitle}>{t(titleKey)}</h3>');
  });

  it('★ 后台模块不分"插件 / 无界面"：行上不挂标签，用户不必知道它从哪来', () => {
    const groups = read('PanelGroupRows.tsx');

    expect(groups).not.toContain('rowTag');
    expect(groups).not.toContain('row.plugin');
    expect(groups).not.toContain('row.hasCard');
  });

  it('★ 两语言文案齐、无内部词（后台模块这一组）', () => {
    const internal = ['外壳', '协议', '声明', '清单', 'apiVersion', 'hasCard'];
    for (const language of ['zh', 'en'] as const) {
      const sentence = dictionaries[language]['panels.groupBackground'] ?? '';
      expect(sentence.length, `${language}:groupBackground`).toBeGreaterThan(0);
      for (const word of internal) expect(sentence, `${language}:${word}`).not.toContain(word);
    }
    expect(dictionaries.zh['panels.groupBackground']).toBe('后台模块');
    expect(dictionaries.en['panels.groupBackground']).toBe('Background modules');
  });
});
