import { useApiResource } from '@/shared/hooks/use-api-resource';
import type { WorkbenchHealthSnapshot } from './workbench-health';

export interface WorkbenchHealthHandle {
  readonly value: WorkbenchHealthSnapshot | undefined;
  readonly unreadable: boolean;
  readonly error: string | undefined;
}

export function useWorkbenchHealth(): WorkbenchHealthHandle {
  const health = useApiResource<WorkbenchHealthSnapshot>('health', {}, 0);
  return {
    value: health.value,
    unreadable: health.phase === 'error',
    error: health.error?.message,
  };
}
