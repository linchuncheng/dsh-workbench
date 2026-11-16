import { createElement as h, useState } from 'react';
import type {
  WorkbenchModelChoice,
  WorkbenchModuleModelsSnapshot,
  WorkbenchSettingsApplied,
  WorkbenchSettingsSnapshot,
} from '@/kernel/contract/workbench-settings';
import {
  WORKBENCH_MODULE_MODELS_ROUTE,
  WORKBENCH_SETTINGS_RESOURCE,
  WORKBENCH_SETTINGS_ROUTE,
} from '@/kernel/contract/workbench-settings';
import type { Translate } from '@dsh-workbench/shared';
import { SelectField } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { SettingsRow } from './SettingsRow';
import {
  moduleModelChoiceOf,
  moduleModelChoicesOf,
  moduleModelLabelOf,
} from './module-model-choices';
import styles from './ModuleModelItem.module.css';

export interface ModuleModelItemProps {
  readonly t: Translate;
}

export function ModuleModelItem({ t }: ModuleModelItemProps): JSX.Element {
  const [revision, setRevision] = useState(0);
  const [override, setOverride] = useState<WorkbenchModelChoice | null | undefined>(undefined);
  const snapshot = useApiResource<WorkbenchSettingsSnapshot>(WORKBENCH_SETTINGS_ROUTE, {}, revision);
  const catalog = useApiResource<WorkbenchModuleModelsSnapshot>(
    WORKBENCH_MODULE_MODELS_ROUTE,
    {},
    revision,
  );
  const write = useHostWrite<WorkbenchSettingsApplied>({
    channel: 'actions',
    resource: WORKBENCH_SETTINGS_RESOURCE,
    networkText: t('moduleModel.failed'),
  });
  const settingsFailed = snapshot.phase === 'error';
  const catalogFailed = catalog.phase === 'error';
  const stored = snapshot.value?.settings.moduleModel;
  const current = override === undefined ? (stored ?? null) : override;
  const groups = catalog.value?.groups ?? [];
  const { options, selected } = moduleModelChoicesOf({
    groups,
    stored: current,
    followLabel: t('moduleModel.followDefault'),
    savedLabel:
      current === null ? '' : t('moduleModel.unavailable', { target: moduleModelLabelOf(groups, current) }),
  });
  const reading =
    (catalog.value === undefined && !catalogFailed) || (stored === undefined && !settingsFailed);

  const choose = (value: string): void => {
    const next = moduleModelChoiceOf(value) ?? null;
    const previous = override;
    setOverride(next);
    void write.send({ moduleModel: next }).then((outcome) => {
      if (!outcome.ok) setOverride(previous);
    });
  };
  const retry = (): void => setRevision((value) => value + 1);

  return (
    <SettingsRow
      title={t('moduleModel.nav')}
      description={t('moduleModel.lead')}
      error={
        write.failed ??
        (settingsFailed ? t('workbenchSettings.readFailed') : catalogFailed ? t('moduleModel.readFailed') : null)
      }
      control={
        settingsFailed || catalogFailed ? (
          <Button variant="ghost" size="sm" onClick={retry}>
            {t('blocker.retry')}
          </Button>
        ) : (
          <SelectField
            className={styles.picker}
            value={selected}
            options={options}
            onChange={choose}
            disabled={stored === undefined || write.busy}
            loading={reading}
            loadingText={t('moduleModel.reading')}
            search={options.length > 4}
            searchPlaceholder={t('moduleModel.search')}
            placeholder={t('moduleModel.placeholder')}
            emptyText={t('moduleModel.empty')}
            ariaLabel={t('moduleModel.nav')}
            selection="check"
          />
        )
      }
    />
  );
}
