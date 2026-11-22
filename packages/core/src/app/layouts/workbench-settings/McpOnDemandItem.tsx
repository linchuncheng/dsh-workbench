import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { WorkbenchToggleItem } from './WorkbenchToggleItem';

export interface McpOnDemandItemProps {
  readonly t: Translate;
  readonly hint?: string | undefined;
}

export function McpOnDemandItem({ t, hint }: McpOnDemandItemProps): JSX.Element {
  return (
    <WorkbenchToggleItem
      t={t}
      field="mcpOnDemand"
      title={t('mcpOnDemand.nav')}
      description={t('mcpOnDemand.lead')}
      failed={t('mcpOnDemand.failed')}
      hint={hint}
    />
  );
}
