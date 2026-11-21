import { createElement as h } from 'react';
import type { ModuleBlocker, Translate } from '@dsh-workbench/shared';
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
  const blocker: ModuleBlocker = {
    id: code ?? 'board-read-failed',
    severity: 'block',
    title: t('panels.boardReadFailed'),
    hint: t('panels.boardReadFailedHint'),
    ...(detail === null ? {} : { detail: code === undefined || code === null ? detail : `${detail} · ${code}` }),
    actions: [{ kind: 'retry', label: t('panels.retry') }],
  };
  return <BlockerState blocker={blocker} t={t} busy={busy ?? false} onRetry={onRetry} />;
}
