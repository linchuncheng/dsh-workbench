import { requirementVersionText } from '@dsh-workbench/shared';
import { hostSurfaceValue } from '@/shared/hooks/use-runtime-capabilities';

export type HostActionKey =
  | 'panels.market.needsHostAction.desktop'
  | 'panels.market.needsHostAction.dsh';

function desktopOf(): boolean {
  return hostSurfaceValue()?.deployment === 'desktop';
}

export function hostLabel(): string {
  return desktopOf() ? 'DeepSeek Harness' : 'dsh';
}

export function hostActionKey(): HostActionKey {
  return desktopOf() ? 'panels.market.needsHostAction.desktop' : 'panels.market.needsHostAction.dsh';
}

export function hostRequirementParams(
  requirements: Readonly<Record<string, string>> | undefined,
  runtimeVersion: string | undefined,
): Readonly<Record<string, string>> | undefined {
  const version = requirementVersionText(requirements);
  if (version === undefined || runtimeVersion === undefined) return undefined;
  return { host: hostLabel(), version, runtime: runtimeVersion };
}
