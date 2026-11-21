import { createElement as h } from 'react';
import type { ModuleBlocker, Translate } from '@dsh-workbench/shared';
import { blockerOfDiag, isDiagCode } from '@dsh-workbench/shared';
import { BlockerState } from '@/shared/components/BlockerState';

export function BoardReadFailed({
  t,
  detail,
  code,
  busy,
  onRetry,
}: {
  readonly t: Translate;
  readonly detail: string | null;
  readonly code?: string | null | undefined;
  readonly busy?: boolean | undefined;
  readonly onRetry: () => void;
}) {
  const blocker: ModuleBlocker =
    code !== undefined && code !== null && isDiagCode(code)
      ? blockerOfDiag(code, t, detail)
      : {
          id: code ?? 'board-read-failed',
          severity: 'block',
          title: t('panels.boardReadFailed'),
          hint: t('panels.boardReadFailedHint'),
          ...(detail === null ? {} : { detail }),
          actions: [{ kind: 'retry', label: t('panels.retry') }],
        };
  return <BlockerState blocker={blocker} t={t} busy={busy ?? false} onRetry={onRetry} />;
}
