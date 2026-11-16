import type { RefObject } from 'react';
import { useLayoutEffect, useRef } from '../../lib/react.js';

const MENU_ROW_SELECTOR = 'button[role="menuitem"]';

/**
 * 把下拉列表里第 `index` 行滚进可视区：只做最近滚动，不动横向位置。
 * @param viewport - 列表的滚动容器（菜单打开时列表节点）；没给或没有这一行时什么都不做。
 * @param index - 可点行的序号（0 起，分组标题与分隔线不占号）；负数不做事。
 */
export function scrollMenuRowIntoView(viewport: Element | null | undefined, index: number): void {
  if (viewport === null || viewport === undefined || index < 0) return;
  const row = viewport.querySelectorAll<HTMLElement>(MENU_ROW_SELECTOR)[index];
  row?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/**
 * 打开下拉时把当前值那一行滚进可视区，并交出列表末尾那个隐藏锚点的 ref。
 * @param open - 菜单是否打开。
 * @param enabled - 是否做这次对位；`false` 时什么都不做。
 * @param value - 当前选中的值。
 * @param options - 本次实际列出来的候选，顺序与列表一致。
 * @returns 挂在列表末尾的隐藏锚点 ref。
 */
export function useSelectedRowScroll(
  open: boolean,
  enabled: boolean,
  value: string,
  options: readonly { readonly value: string }[],
): RefObject<HTMLSpanElement | null> {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    if (!open || !enabled) return;
    const index = options.findIndex((option) => option.value === value);
    if (index < 0) return;
    scrollMenuRowIntoView(markerRef.current?.parentElement, index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在打开那一下对位；把 options 放进依赖会在边搜边滚时把用户刚滚到的位置抢回来
  }, [open, enabled, value]);
  return markerRef;
}
