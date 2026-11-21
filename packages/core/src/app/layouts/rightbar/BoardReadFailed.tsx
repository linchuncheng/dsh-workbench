import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { CenteredState } from '@dsh-workbench/shared';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

export function BoardReadFailed({
  t,
  detail,
  onRetry,
}: {
  readonly t: Translate;
  readonly detail: string | null;
  readonly onRetry: () => void;
}) {
  return (
    <CenteredState
      icon={null}
      title={t('panels.boardReadFailed')}
      hint={detail === null ? t('panels.boardReadFailedHint') : `${t('panels.boardReadFailedHint')}（${detail}）`}
      action={
        <Button type="button" size="sm" variant="primary" onClick={onRetry}>
          {t('panels.retry')}
        </Button>
      }
    />
  );
}
