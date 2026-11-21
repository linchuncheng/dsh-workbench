import { createElement as h, useState } from 'react';
import type { ReactNode } from 'react';
import type { SelectFieldOption, Translate } from '@dsh-workbench/shared';
import { Note, SelectField } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  WorkbenchSettings,
  WorkbenchSettingsApplied,
  WorkbenchSettingsSnapshot,
} from '@/kernel/contract/workbench-settings';
import { WORKBENCH_SETTINGS_RESOURCE, WORKBENCH_SETTINGS_ROUTE } from '@/kernel/contract/workbench-settings';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { SettingsRow } from './SettingsRow';
import styles from './SettingsPickItem.module.css';

export interface SettingsPickView {
  readonly options: readonly SelectFieldOption[];
  readonly selected: string;
  readonly unavailable: boolean;
}

export interface SettingsPickItemProps<TCatalog> {
  readonly t: Translate;
  readonly title: string;
  readonly description: string;
  readonly catalogRoute: string;
  readonly settingsFailedText: string;
  readonly catalogFailedText: string;
  readonly saveFailedText: string;
  readonly loadingText: string;
  readonly searchPlaceholder: string;
  readonly emptyText?: string | undefined;
  readonly unavailableNote?: string | undefined;
  readonly incomplete?: ((catalog: TCatalog | undefined) => boolean) | undefined;
  readonly renderValue?:
    | ((option: SelectFieldOption | undefined) => ReactNode)
    | undefined;
  readonly storedOf: (settings: WorkbenchSettings) => string;
  readonly requestOf: (value: string) => Record<string, unknown>;
  readonly viewOf: (input: {
    readonly t: Translate;
    readonly catalog: TCatalog | undefined;
    readonly stored: string;
  }) => SettingsPickView;
}

export function SettingsPickItem<TCatalog>(props: SettingsPickItemProps<TCatalog>): JSX.Element {
  const [revision, setRevision] = useState(0);
  const [override, setOverride] = useState<string | undefined>(undefined);
  const snapshot = useApiResource<WorkbenchSettingsSnapshot>(WORKBENCH_SETTINGS_ROUTE, {}, revision);
  const catalog = useApiResource<TCatalog>(props.catalogRoute, {}, revision);
  const write = useHostWrite<WorkbenchSettingsApplied>({
    channel: 'actions',
    resource: WORKBENCH_SETTINGS_RESOURCE,
    networkText: props.saveFailedText,
  });
  const settingsFailed = snapshot.phase === 'error';
  const catalogFailed = catalog.phase === 'error';
  const storedSettings = snapshot.value?.settings;
  const stored = storedSettings === undefined ? undefined : props.storedOf(storedSettings);
  const current = override ?? stored ?? '';
  const view = props.viewOf({ t: props.t, catalog: catalog.value, stored: current });
  const reading =
    (catalog.value === undefined && !catalogFailed) ||
    (stored === undefined && !settingsFailed) ||
    props.incomplete?.(catalog.value) === true;
  const failed = settingsFailed || catalogFailed;

  const choose = (value: string): void => {
    const previous = override;
    setOverride(value);
    void write.send(props.requestOf(value)).then((outcome) => {
      if (!outcome.ok) setOverride(previous);
    });
  };
  const retry = (): void => setRevision((value) => value + 1);

  return (
    <SettingsRow
      title={props.title}
      description={props.description}
      error={
        write.failed ??
        (settingsFailed ? props.settingsFailedText : catalogFailed ? props.catalogFailedText : null)
      }
      control={
        failed ? (
          <Button variant="ghost" size="sm" onClick={retry}>
            {props.t('blocker.retry')}
          </Button>
        ) : (
          <SelectField
            className={styles.picker}
            value={view.selected}
            options={view.options}
            renderValue={props.renderValue ?? ((option) => option?.label)}
            onChange={choose}
            disabled={stored === undefined || write.busy}
            loading={reading}
            loadingText={props.loadingText}
            search={view.options.length > 4}
            searchPlaceholder={props.searchPlaceholder}
            emptyText={props.emptyText}
            ariaLabel={props.title}
            selection="check"
          />
        )
      }
    >
      {view.unavailable && stored !== undefined && !reading && props.unavailableNote !== undefined ? (
        <Note tone="problem">{props.unavailableNote}</Note>
      ) : null}
    </SettingsRow>
  );
}
