import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRow, MarketRowAction } from './market-row-types';

export function UpdateAllPlugins({
  t,
  rows,
  act,
}: {
  readonly t: Translate;
  readonly rows: readonly MarketRow[];
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (rows.length === 0) return null;
  const run = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      for (const row of rows) await act(row.id, 'update-plugin');
    } finally {
      setBusy(false);
    }
  };
  return h(
    Button,
    {
      variant: 'ghost',
      size: 'sm',
      disabled: busy,
      onClick: () => {
        void run();
      },
    },
    t(busy ? 'panels.market.updatingAll' : 'panels.market.updateAllPlugins'),
  );
}
