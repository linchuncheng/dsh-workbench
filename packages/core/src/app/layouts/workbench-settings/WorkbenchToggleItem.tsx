import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { WorkbenchSettings } from '@/kernel/contract/workbench-settings';
import { SettingsControl } from './SettingsControl';
import { SettingsRow } from './SettingsRow';
import { useWorkbenchSettings } from './use-workbench-settings';

export type WorkbenchToggleField = 'mcpOnDemand';

export interface WorkbenchToggleItemProps {
  readonly t: Translate;
  readonly field: WorkbenchToggleField;
  readonly title: string;
  readonly description: string;
  readonly failed: string;
  readonly hint?: string | undefined;
}

export function WorkbenchToggleItem({
  t,
  field,
  title,
  description,
  failed,
  hint,
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
      hint={hint}
      error={settings.error}
      control={
        <SettingsControl t={t} readFailed={settings.readFailed} onRetry={settings.retry}>
          <Switch
            checked={checked}
            disabled={stored === undefined || settings.busy}
            label={title}
            onChange={toggle}
          />
        </SettingsControl>
      }
    />
  );
}
