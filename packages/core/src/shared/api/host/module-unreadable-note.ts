import type { DiagRecorder } from '@dsh-workbench/shared/host';
import type { UnreadableModule } from '@dsh-workbench/shared/host';

export function noteUnreadableModules(diag: DiagRecorder | undefined, unreadable: readonly UnreadableModule[]): void {
  for (const item of unreadable) {
    diag?.once(`module-unreadable:${item.pkg}`, {
      code: 'MODULE_UNREADABLE',
      subject: { pkg: item.pkg },
      detail: { reason: item.reason },
    });
  }
}
