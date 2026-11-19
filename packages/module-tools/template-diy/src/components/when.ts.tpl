import { kit } from '@dsh-workbench/core/client';
import { timeOf } from '../model/time';

type Translate = (key: string, params?: Record<string, unknown>) => string;

export function when(value: string, t: Translate): string {
  const ms = timeOf(value);
  return ms === undefined ? '—' : kit.lib.relativeTimeAgo(ms, t);
}
