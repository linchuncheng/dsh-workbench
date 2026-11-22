import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { WorkbenchSettings } from '@/kernel/contract/workbench-settings';
import { SettingsRow } from './SettingsRow';
import { useWorkbenchSettings } from './use-workbench-settings';

export type WorkbenchToggleField = 'mcpOnDemand';

export interface WorkbenchToggleItemProps {
  readonly t: Translate;
  readonly field: WorkbenchToggleField;
  readonly title: string;
  readonly description: string;
  readonly failed: string;
}

export function WorkbenchToggleItem({
  t,
  field,
  title,
  description,
  failed,
}: WorkbenchToggleItemProps): JSX.Element {
  const settings = useWorkbenchSettings(t, failed);
  const [override, setOverride] = useState<boolean | null>(null);
  const stored: WorkbenchSettings[WorkbenchToggleField] | undefined = settings.snapshot?.settings[field];
  const checked = override ?? stored ?? false;

  const toggle = (next: boolean): void => {
    setOverride(next);
    void settings.send({ [field]: next }).then((outcome) => {
      if (!outcome.ok) setOverride(null);
    });
  };

  return (
    <SettingsRow
      title={title}
      description={description}
      error={settings.error}
      control={
        settings.readFailed ? (
          <Button variant="ghost" size="sm" onClick={settings.retry}>
            {t('blocker.retry')}
          </Button>
        ) : (
          <Switch
            checked={checked}
            disabled={stored === undefined || settings.busy}
            label={title}
            onChange={toggle}
          />
        )
      }
    />
  );
}
