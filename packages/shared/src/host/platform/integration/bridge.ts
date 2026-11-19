import type { HostOs } from '../../../contract/protocol/platform.js';
import { quoteShellArgFor } from '../ops/shell.js';

export function bridgeFixOf(command: string, issues: readonly string[], platform: HostOs): string | undefined {
  const token = quoteShellArgFor(command, platform);
  if (issues.includes('stale')) return `${token} daemon stop && ${token} daemon restart`;
  if (issues.includes('profile')) return `${token} profile list`;
  if (issues.includes('daemon')) return `${token} daemon restart`;
  return undefined;
}
