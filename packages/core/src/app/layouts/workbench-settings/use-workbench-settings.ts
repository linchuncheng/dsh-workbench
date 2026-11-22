import { useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import type {
  WorkbenchSettingsApplied,
  WorkbenchSettingsRequest,
  WorkbenchSettingsSnapshot,
} from '@/kernel/contract/workbench-settings';
import {
  WORKBENCH_SETTINGS_RESOURCE,
  WORKBENCH_SETTINGS_ROUTE,
} from '@/kernel/contract/workbench-settings';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';

export interface WorkbenchSettingsHandle {
  readonly snapshot: WorkbenchSettingsSnapshot | undefined;
  readonly readFailed: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  retry(): void;
  send(request: WorkbenchSettingsRequest): Promise<{ readonly ok: boolean }>;
}

export function useWorkbenchSettings(t: Translate, networkText: string): WorkbenchSettingsHandle {
  const [revision, setRevision] = useState(0);
  const snapshot = useApiResource<WorkbenchSettingsSnapshot>(WORKBENCH_SETTINGS_ROUTE, {}, revision);
  const write = useHostWrite<WorkbenchSettingsApplied>({
    channel: 'actions',
    resource: WORKBENCH_SETTINGS_RESOURCE,
    networkText,
  });
  const busy = useVisibleBusy(write.busy, MIN_BUSY_MS);
  const readFailed = snapshot.phase === 'error';
  return {
    snapshot: snapshot.phase === 'ready' ? snapshot.value : undefined,
    readFailed,
    busy: busy.busy,
    error: write.failed ?? (readFailed ? t('workbenchSettings.readFailed') : null),
    retry: () => setRevision((current) => current + 1),
    send: (request) => write.send(request as Record<string, unknown>),
  };
}
