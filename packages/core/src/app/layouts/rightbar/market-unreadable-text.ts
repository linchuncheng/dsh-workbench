import type { Translate } from '@dsh-workbench/shared';

export interface UnreadableModuleRow {
  readonly pkg: string;
  readonly reason: string;
}

export function unreadableBadgeText(t: Translate, count: number): string {
  return t('market.unreadable.badge', { count: String(count) });
}

export function unreadableTitle(t: Translate): string {
  return t('market.unreadable.title');
}

export function unreadableLead(t: Translate): string {
  return t('market.unreadable.lead');
}

export function unreadableRows(rows: readonly UnreadableModuleRow[]): readonly string[] {
  return rows.map((one) => `${one.pkg}：${one.reason}`);
}

export function unreadableCopyText(rows: readonly UnreadableModuleRow[]): string {
  return unreadableRows(rows).join('\n');
}

export function marketUnreadableText(input: {
  readonly t: Translate;
  readonly unreadable: readonly UnreadableModuleRow[];
  readonly readFailure: string | null;
}): readonly string[] {
  const lines = input.unreadable.length === 0 ? [] : [unreadableTitle(input.t), unreadableLead(input.t), ...unreadableRows(input.unreadable)];
  return input.readFailure === null ? lines : [...lines, input.readFailure];
}
