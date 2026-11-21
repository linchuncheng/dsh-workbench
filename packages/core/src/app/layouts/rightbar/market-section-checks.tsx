import { createElement as h } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';

import { SectionCheck } from '../market/section-check';
import type { VersionsCheck, VersionsPart } from '../market/use-module-versions';
import type { LatestCheckSummary } from './market-rows';

const NO_CHECK: VersionsCheck = { checking: false, failed: false, checkedAt: null };

export interface SectionChecksInput {
  readonly latestModules: LatestCheckSummary;
  readonly latestPlugins: LatestCheckSummary;
  readonly disabled: boolean;
  readonly onCheck?: ((part: VersionsPart) => void) | undefined;
}

export function sectionChecksOf(
  t: Translate,
  seats: { readonly modules?: VersionsCheck | undefined; readonly plugins?: VersionsCheck | undefined },
  input: SectionChecksInput,
): Readonly<Record<VersionsPart, ReactNode>> {
  return {
    modules: (
      <SectionCheck
        t={t}
        part="modules"
        seat={seats.modules ?? NO_CHECK}
        latest={input.latestModules}
        disabled={input.disabled}
        onCheck={input.onCheck}
      />
    ),
    plugins: (
      <SectionCheck
        t={t}
        part="plugins"
        seat={seats.plugins ?? NO_CHECK}
        latest={input.latestPlugins}
        disabled={input.disabled}
        onCheck={input.onCheck}
      />
    ),
  };
}
