import type { RuntimeStatus } from '@dsh-workbench/shared';
import type { MarketRuntimeFact } from './market-detail-facts';

export function workbenchRuntimeFact(
  runtimes: Readonly<Record<string, RuntimeStatus>> | undefined,
  label: string,
  resolveNote: (text: { readonly zh: string; readonly en: string }) => string,
): MarketRuntimeFact | undefined {
  const entry = Object.entries(runtimes ?? {})[0];
  if (entry === undefined) return undefined;
  const [id, status] = entry;
  const name = label.trim() === '' ? id : label.trim();
  return {
    label: name,
    ...(status.version === undefined ? {} : { version: status.version }),
    ready: status.ready === true,
    ...(status.note === undefined ? {} : { note: resolveNote(status.note) }),
  };
}
