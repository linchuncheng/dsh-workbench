import { Fragment, createElement as h } from 'react';
import type { ReactNode } from '@dsh-workbench/shared';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

export interface SettingsControlProps {
  readonly t: Translate;
  readonly readFailed: boolean;
  readonly onRetry: () => void;
  readonly children: ReactNode;
}

export function SettingsControl({ t, readFailed, onRetry, children }: SettingsControlProps): JSX.Element {
  if (!readFailed) return h(Fragment, null, children);
  return (
    <Button variant="ghost" size="sm" onClick={onRetry}>
      {t('blocker.retry')}
    </Button>
  );
}
