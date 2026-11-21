import type { Translate } from '@dsh-workbench/shared';

export function marketUnreadableText(input: {
  readonly t: Translate;
  readonly unreadable: readonly { readonly pkg: string; readonly reason: string }[];
  readonly readFailure: string | null;
}): string[] {
  const { t, unreadable, readFailure } = input;
  return [
    ...(readFailure === null ? [] : [`${t('panels.market.modulesReadFailed')}（${readFailure}）`]),
    ...(unreadable.length === 0
      ? []
      : [t('panels.market.unreadable', { list: unreadable.map((one) => `${one.pkg}（${one.reason}）`).join('；') })]),
  ];
}
