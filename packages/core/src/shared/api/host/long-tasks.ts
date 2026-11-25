import { longTaskRowBase, type LongTaskBase, type LongTaskRegistry } from '@dsh-workbench/shared/host';
import type { ShellLongTaskRow } from '@/kernel/contract/long-tasks';

export function liveLongTaskRows(
  runs: ReadonlyMap<string, LongTaskRegistry<LongTaskBase>>,
): ShellLongTaskRow[] {
  const rows: ShellLongTaskRow[] = [];
  for (const [unit, registry] of runs) {
    if (typeof registry.live !== 'function') continue;
    for (const snapshot of registry.live()) {
      rows.push({
        unit,
        id: snapshot.id,
        workspace: snapshot.workspace,
        ...longTaskRowBase(snapshot),
        ...(registry.resumable === true ? { resumable: true } : {}),
        ...(registry.answerable === true ? { answerable: true } : {}),
      });
    }
  }
  return rows;
}
