import type { ReactNode } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';

import type { VersionsCheck } from '../market/use-module-versions';
import type { VersionsPart } from '../market/use-module-versions';
import { sectionChecksOf } from './market-section-checks';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { ModuleVersion } from '@/kernel/contract/bundle-install';
import { checkedPluginCount, latestCheckSummary } from './market-rows';

interface MarketMockSeats {
  readonly installed?: readonly ModuleVersion[] | undefined;
  readonly plugins?: readonly InstalledPlugin[] | undefined;
}

export interface MarketChecksInput {
  readonly t: Translate;
  readonly mock: MarketMockSeats | undefined;
  readonly installed: readonly ModuleVersion[] | null | undefined;
  readonly plugins: readonly InstalledPlugin[] | null | undefined;
  readonly modulesCheck: VersionsCheck | undefined;
  readonly pluginsCheck: VersionsCheck | undefined;
  readonly pending: unknown;
  readonly onCheck: ((part: VersionsPart) => void) | undefined;
  readonly onChanged: (options: { readonly force?: boolean }) => void;
  readonly setFailed: (next: null) => void;
  readonly checking: boolean;
}

export interface MarketChecks {
  readonly checks: Readonly<Record<VersionsPart, ReactNode>>;
  readonly recheck: () => void;
  readonly rechecking: boolean;
}

const IDLE_CHECK: VersionsCheck = { checking: false, failed: false, checkedAt: null };

export function useMarketChecks(input: MarketChecksInput): MarketChecks {
  const { t } = input;
  const mock = input.mock;
  const { busy: rechecking } = useVisibleBusy(input.checking, MIN_BUSY_MS);
  const recheck = (): void => {
    input.setFailed(null);
    if (mock === undefined) input.onChanged({ force: true });
  };
  const checks = sectionChecksOf(
    t,
    { modules: input.modulesCheck ?? IDLE_CHECK, plugins: input.pluginsCheck ?? IDLE_CHECK },
    {
      latestModules: latestCheckSummary(mock?.installed ?? input.installed ?? undefined),
      latestPlugins: { checked: checkedPluginCount(mock?.plugins ?? input.plugins), unknown: 0 },
      disabled: input.pending !== null,
      onCheck: mock === undefined ? input.onCheck : undefined,
    },
  );
  return { checks, recheck, rechecking };
}
