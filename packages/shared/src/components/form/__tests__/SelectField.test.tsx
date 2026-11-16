import { describe, expect, it, vi } from 'vitest';

let states: unknown[] = [];
let writes: Array<{ index: number; next: unknown }> = [];
let hookAt = 0;
vi.mock('../../../lib/react.js', () => ({
  Fragment: Symbol.for('react.fragment'),
  h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (compute: () => unknown) => compute(),
  useRef: () => ({ current: null }),
  useState: (initial: unknown) => {
    const index = hookAt++;
    const value = states.length > 0 ? states.shift() : initial;
    return [
      value,
      (next: unknown) => {
        const resolved = typeof next === 'function' ? (next as (previous: unknown) => unknown)(value) : next;
        writes.push({ index, next: resolved });
      },
    ];
  },
}));

vi.mock('../SelectField.css', () => ({ default: {} }));

import { Menu, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from '../../feedback/Spinner.js';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../../../lib/react.js';
import { Field } from '../Field.js';
import { TextField } from '../TextField.js';
import {
  SelectField,
  defaultSelectFilter,
  selectCursorValue,
  selectEntries,
  selectKeyboardOrigin,
  stepSelectCursor,
} from '../SelectField.js';
import { scrollMenuRowIntoView } from '../use-select-scroll.js';

interface AnyElement {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children?: unknown;
}

function childrenOf(element: AnyElement): unknown {
  return element.children ?? element.props['children'];
}

function collect(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (node === null || node === void 0 || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') return out;
  if (Array.isArray(node)) {
    for (const one of node) collect(one, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const element = node as AnyElement;
  out.push(element);
  collect(childrenOf(element), out);
  return out;
}

function elementsOf(root: unknown): readonly AnyElement[] {
  return collect(root);
}

function menuOf(root: unknown): AnyElement {
  const menu = elementsOf(root).find((one) => one.type === Menu);
  if (menu === undefined) throw new Error('没有渲染出 Menu');
  return menu;
}

function inputOf(root: unknown): AnyElement | undefined {
  return elementsOf(root).find((one) => one.type === TextField);
}

function render(props: Record<string, unknown>, state: readonly unknown[] = []): unknown {
  states = [...state];
  writes = [];
  hookAt = 0;
  return SelectField({
    value: 'b',
    options: OPTIONS,
    onChange: () => {},
    ...props,
  } as never);
}

function pressKey(root: unknown, key: string): void {
  const onKeyDown = inputOf(menuOf(root).props['anchor'])?.props['onKeyDown'] as
    | ((event: unknown) => void)
    | undefined;
  onKeyDown?.({
    key,
    nativeEvent: { isComposing: false },
    stopPropagation: () => {},
    preventDefault: () => {},
  });
}

function cursorWrites(): readonly unknown[] {
  return writes.filter((one) => one.index === 2).map((one) => one.next);
}

const OPTIONS = [
  { value: 'a', label: '工作区甲', group: '工作区' },
  { value: 'b', label: '工作区乙', group: '工作区' },
  { value: 'c', label: '默认工作区', group: '默认' },
];

describe('SelectField：工作区那套下拉的公共形状', () => {
  it('关着：触发钮上是当前选项，菜单条目已经按分组排好', () => {
    const root = render({});
    const menu = menuOf(root);

    expect(menu.props['open']).toBe(false);
    expect(menu.props['listClassName']).toContain('wb-selectMenu');
    const trigger = elementsOf(menu.props['anchor']).find((one) => one.type === 'button');
    expect(trigger?.props['aria-haspopup']).toBe('listbox');
    expect(trigger?.props['aria-expanded']).toBe(false);
    expect(JSON.stringify(trigger?.children)).toContain('工作区乙');

    const items = menu.props['items'] as readonly MenuEntry[];
    expect(items).toEqual([
      { type: 'label', id: '__wb-select-group-0', text: '工作区' },
      { id: 'a', label: '工作区甲' },
      { id: 'b', label: '工作区乙' },
      { type: 'label', id: '__wb-select-group-3', text: '默认' },
      { id: 'c', label: '默认工作区' },
    ]);
  });

  it('★ 列表里留一个隐藏的滚动定位锚：打开时靠它把选中项滚进可视区', () => {
    const marker = (menuOf(render({})).children as AnyElement[]).find((one) => one.type === 'span');

    expect(marker?.props['hidden']).toBe(true);
    expect(marker?.props['ref']).toBeDefined();
  });

  it('开着：锚点换成搜索框（这是这套交互的要点）', () => {
    const root = render({}, [true, '', null]);
    const menu = menuOf(root);

    expect(menu.props['open']).toBe(true);
    const anchor = elementsOf(menu.props['anchor']);
    const box = anchor.find((one) => one.props['className'] === 'wb-selectSearch');
    expect(box).toBeDefined();
    expect(anchor.some((one) => one.type === 'button')).toBe(false);
    expect(inputOf(menu.props['anchor'])?.props['value']).toBe('');
  });

  it('★ 只显示图标那一档（折叠左栏那个工作区钮）：没有值也没有箭头，读屏名字只能来自 ariaLabel', () => {
    const icon = { type: 'i', props: {}, children: [] };
    const trigger = elementsOf(
      menuOf(render({ variant: 'ghost', iconOnly: true, icon, ariaLabel: '切换项目' })).props['anchor'],
    ).find((one) => one.type === 'button');

    expect(trigger?.props['className']).toBe('wb-selectTrigger wb-selectGhost wb-selectIconOnly');
    expect(trigger?.props['aria-label']).toBe('切换项目');
    expect(JSON.stringify(trigger?.children)).not.toContain('wb-selectValue');
    expect(JSON.stringify(trigger?.children)).not.toContain('wb-selectChevron');
    expect(elementsOf(trigger?.children).some((one) => one.props['className'] === 'wb-selectIcon')).toBe(true);
  });

  it('不给 iconOnly 时一个字节都不变（宽态那套触发器照旧）', () => {
    const trigger = elementsOf(menuOf(render({ variant: 'ghost' })).props['anchor']).find(
      (one) => one.type === 'button',
    );

    expect(trigger?.props['className']).toBe('wb-selectTrigger wb-selectGhost');
    expect(JSON.stringify(trigger?.children)).toContain('wb-selectValue');
  });

  it('★ chevronHidden：箭头留在原位但藏起来，调用方在那个位置叠自己的操作钮', () => {
    const chevronOf = (props: Record<string, unknown>): AnyElement | undefined =>
      elementsOf(menuOf(render(props)).props['anchor']).find(
        (one) => one.props?.['className'] === 'wb-selectChevron',
      );

    expect(chevronOf({})?.props['data-hidden']).toBeUndefined();
    console.log('NULLPROPS', JSON.stringify((globalThis as Record<string, unknown>)['__probe']));
    expect(chevronOf({ chevronHidden: true })?.props['data-hidden']).toBe('');
  });

  it('★ search=false：锚点仍是触发钮（折叠左栏那个下拉要的就是"点开直接是列表"）', () => {
    const root = render({ search: false });
    const anchor = elementsOf(menuOf(root).props['anchor']);

    expect(anchor.some((one) => one.type === 'button')).toBe(true);
    const classes = anchor.map((one) => one.props?.['className']).filter((one) => typeof one === 'string');
    expect(classes).not.toContain('wb-selectSearch');
    expect(inputOf(menuOf(root).props['anchor'])).toBeUndefined();
  });

  it('禁用：触发钮真的 disabled（压暗交给样式，别只在视觉上假装）', () => {
    const root = render({ disabled: true });
    const trigger = elementsOf(menuOf(root).props['anchor']).find((one) => one.type === 'button');

    expect(trigger?.props['disabled']).toBe(true);
  });

  it('默认是常规下拉框，无边框那一档要显式选（工作区切换器走的是它）', () => {
    const boxed = elementsOf(menuOf(render({})).props['anchor']).find(
      (one) => one.type === 'button',
    );
    expect(boxed?.props['className']).toBe('wb-selectTrigger');

    const ghost = elementsOf(menuOf(render({ variant: 'ghost' })).props['anchor']).find(
      (one) => one.type === 'button',
    );
    expect(ghost?.props['className']).toBe('wb-selectTrigger wb-selectGhost');

    const ghostSearch = elementsOf(
      menuOf(render({ variant: 'ghost' }, [true, '', null])).props['anchor'],
    ).find((one) => one.props['className'] === 'wb-selectSearch wb-selectGhost');
    expect(ghostSearch).toBeDefined();
  });

  it('搜索：按纯文本过滤（label 不是字符串时用 searchText），结果平铺不再画组标题', () => {
    const root = render({}, [true, '默认', null]);
    const items = menuOf(root).props['items'] as readonly MenuEntry[];
    expect(items).toEqual([{ id: 'c', label: '默认工作区' }]);

    const byText = menuOf(
      render(
        { options: [{ value: 'a', label: <span>看不见的字</span>, searchText: '工作区甲' }] },
        [true, '甲', null],
      ),
    ).props['items'] as readonly MenuEntry[];
    expect(byText).toEqual([{ id: 'a', label: expect.anything() }]);
  });

  it('★ 选中项：键盘游标没动时先用当前值（打开就能看出我在哪）', () => {
    expect(menuOf(render({})).props['selectedId']).toBe('b');
    expect(menuOf(render({}, [true, '', 2])).props['selectedId']).toBe('c');
    expect(menuOf(render({ value: '' })).props['selectedId']).toBeUndefined();
  });

  it('★ initialSelectedId：游标没动时高亮它，回车也选它；有查询时让位给匹配结果', () => {
    const preferred = vi.fn();
    const root = render({ initialSelectedId: 'c', onChange: preferred }, [true, '', null]);
    expect(menuOf(root).props['selectedId']).toBe('c');
    pressKey(root, 'Enter');
    expect(preferred).toHaveBeenCalledWith('c');

    const filtered = vi.fn();
    const searched = render({ initialSelectedId: 'c', onChange: filtered }, [true, '甲', null]);
    expect(menuOf(searched).props['selectedId']).toBe('a');
    pressKey(searched, 'Enter');
    expect(filtered).toHaveBeenCalledWith('a');

    const plain = vi.fn();
    pressKey(render({ onChange: plain }, [true, '', null]), 'Enter');
    expect(plain).toHaveBeenCalledWith('a');
  });

  it('★ 方向键起点：游标没动时从默认高亮那一行接着走，不跳回第一行', () => {
    const down = render({ initialSelectedId: 'a' }, [true, '', null]);
    expect(menuOf(down).props['selectedId']).toBe('a');
    pressKey(down, 'ArrowDown');
    expect(cursorWrites()).toEqual([1]);

    const up = render({ initialSelectedId: 'c' }, [true, '', null]);
    pressKey(up, 'ArrowUp');
    expect(cursorWrites()).toEqual([1]);

    const searched = render({ initialSelectedId: 'c' }, [true, '工作区', null]);
    expect(menuOf(searched).props['selectedId']).toBe('a');
    pressKey(searched, 'ArrowDown');
    expect(cursorWrites()).toEqual([1]);

    const plain = render({}, [true, '', null]);
    pressKey(plain, 'ArrowDown');
    expect(cursorWrites()).toEqual([0]);
  });

  it('★ initialSelectedId=null：没有默认目标就不高亮、回车不动作；一输入查询仍取首条匹配', () => {
    const onChange = vi.fn();
    const idle = render({ value: '', initialSelectedId: null, onChange }, [true, '', null]);
    expect(menuOf(idle).props['selectedId']).toBeUndefined();
    pressKey(idle, 'Enter');
    expect(onChange).not.toHaveBeenCalled();

    const searched = render({ value: '', initialSelectedId: null, onChange }, [true, '工作区', null]);
    expect(menuOf(searched).props['selectedId']).toBe('a');
    pressKey(searched, 'Enter');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('搜不到 / 加载中 / 空名单退化成手填，三种态各有明确落点', () => {
    const empty = render({ emptyText: '没有匹配的工作区' }, [true, 'zzz', null]);
    expect(menuOf(empty).props['items']).toEqual([
      { type: 'label', id: '__wb-select-empty__', text: '没有匹配的工作区' },
    ]);

    const withoutEmpty = render({}, [true, 'zzz', null]);
    expect(menuOf(withoutEmpty).props['items']).toEqual([]);

    const loading = render({ loading: true, loadingText: '正在读工作区' });
    const busy = elementsOf(loading).find((one) => one.type === 'button');
    expect(busy?.props['aria-busy']).toBe('true');
    expect(busy?.props['disabled']).toBe(true);
    expect(elementsOf(busy?.children).some((one) => one.type === TextShimmer)).toBe(true);
    expect(elementsOf(busy?.children).some((one) => one.type === Spinner)).toBe(true);

    const fallback = render({
      options: [],
      fallback: { value: '手填的', onChange: () => {} },
    });
    expect(inputOf(fallback)?.props['value']).toBe('手填的');
  });

  it('invalid：触发钮与退化成手填那格都挂 aria-invalid，没给就不挂', () => {
    const trigger = elementsOf(menuOf(render({ invalid: true })).props['anchor']).find(
      (one) => one.type === 'button',
    );
    expect(trigger?.props['aria-invalid']).toBe(true);

    const ok = elementsOf(menuOf(render({})).props['anchor']).find((one) => one.type === 'button');
    expect(ok?.props['aria-invalid']).toBeUndefined();

    const fallback = render({
      options: [],
      invalid: true,
      fallback: { value: '手填的', onChange: () => {} },
    });
    expect(inputOf(fallback)?.props['invalid']).toBe(true);
  });

  it('label / hint 走 Field，footer 那条动作独立成一行', () => {
    const root = render({ label: '工作区', hint: '三选一' });
    expect(elementsOf(root).some((one) => one.type === Field)).toBe(true);

    const footer = render({ footer: { label: '添加工作区…' }, onFooter: () => {} });
    expect(menuOf(footer).props['footer']).toEqual([
      { id: '__wb-select-footer__', label: '添加工作区…' },
    ]);
  });

  it('选中与页脚动作各给各的出口，选中之后菜单关掉', () => {
    const seen: string[] = [];
    const root = render({ onChange: (next: string) => seen.push(next) });
    (menuOf(root).props['onSelect'] as (id: string) => void)('c');
    expect(seen).toEqual(['c']);

    let added = 0;
    const withFooter = render({ footer: { label: '添加工作区…' }, onFooter: () => (added += 1) });
    (menuOf(withFooter).props['onSelect'] as (id: string) => void)('__wb-select-footer__');
    expect(added).toBe(1);
  });

  it('游标：从 null 起步、两头回绕、空名单不动', () => {
    expect(stepSelectCursor(OPTIONS, null, 1)).toBe(0);
    expect(stepSelectCursor(OPTIONS, null, -1)).toBe(2);
    expect(stepSelectCursor(OPTIONS, 2, 1)).toBe(0);
    expect(stepSelectCursor(OPTIONS, 0, -1)).toBe(2);
    expect(stepSelectCursor([], null, 1)).toBeNull();
    expect(selectCursorValue(OPTIONS, 9)).toBe('c');
    expect(selectCursorValue(OPTIONS, null)).toBeNull();
    expect(selectCursorValue([], 0)).toBeNull();
  });

  it('方向键起点：游标动过就接着游标，没动过就落在高亮那一项', () => {
    expect(selectKeyboardOrigin(OPTIONS, null, 'c')).toBe(2);
    expect(selectKeyboardOrigin(OPTIONS, 1, 'c')).toBe(1);
    expect(selectKeyboardOrigin(OPTIONS, null, undefined)).toBeNull();
    expect(selectKeyboardOrigin(OPTIONS, null, null)).toBeNull();
    expect(selectKeyboardOrigin(OPTIONS, null, 'missing')).toBeNull();
    expect(selectKeyboardOrigin([], null, 'c')).toBeNull();
  });

  it('默认过滤：空查询全过、大小写不敏感、label 与 searchText 都认', () => {
    const option = { value: 'x', label: '腾讯云 · 生产' };
    expect(defaultSelectFilter(option, '  ')).toBe(true);
    expect(defaultSelectFilter(option, '生产')).toBe(true);
    expect(defaultSelectFilter({ value: 'x', label: <span>生产</span>, searchText: 'tencent-prod' }, 'TENCENT')).toBe(
      true,
    );
    expect(defaultSelectFilter(option, 'nope')).toBe(false);
  });

  it('条目构造：图标与禁用照传，分组标题只在换组时出现一次', () => {
    const items = selectEntries(
      [
        { value: 'a', label: '甲', group: 'G', disabled: true },
        { value: 'b', label: '乙', group: 'G', icon: <span>ico</span> },
      ],
      undefined,
    );
    expect(items).toEqual([
      { type: 'label', id: '__wb-select-group-0', text: 'G' },
      { id: 'a', label: '甲', disabled: true },
      { id: 'b', label: '乙', icon: expect.anything() },
    ]);
  });

  it('★ 滚到选中项：按序号取可点行，最近滚动，不横向挪', () => {
    const calls: unknown[] = [];
    const seen: string[] = [];
    const rows = [
      { scrollIntoView: (options: unknown) => calls.push({ first: options }) },
      { scrollIntoView: (options: unknown) => calls.push({ second: options }) },
    ];
    const viewport = {
      querySelectorAll: (selector: string) => {
        seen.push(selector);
        return rows;
      },
    } as unknown as Element;

    scrollMenuRowIntoView(viewport, 1);

    expect(calls).toEqual([{ second: { block: 'nearest', inline: 'nearest' } }]);
    expect(seen).toEqual(['button[role="menuitem"]']);
  });

  it('滚到选中项：序号越界、没有列表、那一行不会滚时都不炸', () => {
    const calls: unknown[] = [];
    const viewportOf = (rows: readonly Record<string, unknown>[]): Element =>
      ({ querySelectorAll: () => rows }) as unknown as Element;

    scrollMenuRowIntoView(viewportOf([{ scrollIntoView: (options: unknown) => calls.push(options) }]), -1);
    scrollMenuRowIntoView(null, 0);
    scrollMenuRowIntoView(undefined, 0);
    scrollMenuRowIntoView(viewportOf([{}]), 0);
    scrollMenuRowIntoView(viewportOf([]), 0);

    expect(calls).toEqual([]);
  });

  it('★ 条目构造：groups: false 时平铺，不插分组标题', () => {
    const items = selectEntries(
      [
        { value: 'a', label: '甲', group: 'G' },
        { value: 'b', label: '乙', group: 'G' },
      ],
      undefined,
      { groups: false },
    );
    expect(items).toEqual([
      { id: 'a', label: '甲' },
      { id: 'b', label: '乙' },
    ]);
  });
});
