import type { MarketRow } from './market-rows';
import { isOnMachine } from './market-state';

export interface MarketSection {
  readonly id: 'installed' | 'not-installed';
  readonly titleKey: string;
  readonly rows: readonly MarketRow[];
}

export function marketOrder(
  rows: readonly MarketRow[],
  titleOf: (row: MarketRow) => string,
): MarketRow[] {
  return [...rows].sort((left, right) => {
    const byTitle = titleOf(left).localeCompare(titleOf(right), 'zh-Hans-CN');
    return byTitle === 0 ? left.id.localeCompare(right.id) : byTitle;
  });
}

function onMachineRow(row: MarketRow): boolean {
  return isOnMachine(row.state) || row.local === true || row.version?.installed !== undefined;
}

export function marketSections(rows: readonly MarketRow[]): MarketSection[] {
  const installed = rows.filter(onMachineRow);
  const rest = rows.filter((row) => !onMachineRow(row));
  return [
    ...(installed.length === 0
      ? []
      : [{ id: 'installed' as const, titleKey: 'panels.market.sectionInstalled', rows: installed }]),
    ...(rest.length === 0
      ? []
      : [{ id: 'not-installed' as const, titleKey: 'panels.market.sectionPending', rows: rest }]),
  ];
}

