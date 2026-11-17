import { Fragment, createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import type { Pending } from './market-view-text';
import type { DetailDependency } from './market-detail-deps';
import { MarketDetail } from './market-detail';
import { UninstallConfirm } from './market-uninstall';
import { useInstalledInfo } from '../market/use-installed-info';
import { runtimeProfileValue, useRuntimeStatuses } from '@/shared/hooks/use-runtime-capabilities';
import { runtimeText } from '@/shared/hooks/locale-text';
import { workbenchRuntimeFact } from './market-runtime-fact';
import type { DetailTab } from '../market/detail-tabs';

const CONFIRM_ACTIONS: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];

export function MarketDetailPage({
  t,
  row,
  pending,
  failure,
  notice,
  boardBusy,
  confirming,
  confirmingRow,
  rowById,
  onBack,
  onConfirming,
  onDefault,
  onAct,
  onRecheck,
  rechecking,
  dependencies,
}: {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly pending: Pending | null;
  readonly failure: MarketFailure | null;
  readonly notice: string | null;
  readonly boardBusy?: boolean | undefined;
  readonly confirming: string | null;
  readonly confirmingRow: MarketRow | undefined;
  readonly rowById: ReadonlyMap<string, MarketRow>;
  readonly onBack: () => void;
  readonly onConfirming: (id: string | null) => void;
  readonly onDefault: (id: string, next: boolean) => Promise<void>;
  readonly onAct: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
  readonly dependencies?: readonly DetailDependency[] | undefined;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const info = useInstalledInfo(row.pkg);
  const runtimes = useRuntimeStatuses();
  const runtime =
    row.workbench === true
      ? workbenchRuntimeFact(runtimes, runtimeProfileValue()?.label ?? '', runtimeText)
      : undefined;
  return (
    <>
      <MarketDetail
        t={t}
        row={row}
        pending={pending}
        failure={failure}
        notice={notice}
        boardBusy={boardBusy}
        onBack={onBack}
        onRequest={(action) =>
          CONFIRM_ACTIONS.includes(action) ? onConfirming(row.id) : void onAct(row.id, action)
        }
        onDefault={(next) => void onDefault(row.id, next)}
        onRecheck={onRecheck}
        rechecking={rechecking}
        tab={tab}
        onTab={setTab}
        info={info}
        dependencies={dependencies}
        runtime={runtime}
      />
      <UninstallConfirm
        t={t}
        confirming={confirming}
        row={confirmingRow}
        onClose={() => onConfirming(null)}
        act={onAct}
        rowById={rowById}
      />
    </>
  );
}
