import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRow } from './market-row-types';
import type { MarketAct } from './market-act';

export function UpdateAllPlugins({
  t,
  rows,
  act,
}: {
  readonly t: Translate;
  readonly rows: readonly MarketRow[];
  readonly act: MarketAct;
}) {
  const [busy, setBusy] = useState(false);
  if (rows.length === 0) return null;
  const run = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await act.many(rows.map((row) => row.id), 'update-plugin');
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
