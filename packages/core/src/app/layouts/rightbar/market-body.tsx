import { Fragment, createElement as h } from 'react';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import type { MarketBodyExtras, MarketBodyProps } from './market-body-props';
import { marketFootVisible } from './market-view-text';
import { marketOrder, marketRowTitle, marketSections, updatablePlugins } from './market-rows';
import { MarketSection } from './market-section';
import { MarketUnreadableBadge } from './market-unreadable-badge';
import { UpdateAllPlugins } from './UpdateAllPlugins';
import { marketSectionIcon } from './market-section-icon';
import { PanelFoot } from '@/shared/components/PanelFoot';
import styles from '../market/MarketPage.module.css';

const CONFIRM_ACTIONS: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];
const NO_ROWS: readonly MarketRow[] = [];

export function MarketBody({
  t,
  self,
  shown,
  pluginList,
  installedList,
  unreadable = [],
  pending,
  failed,
  notice,
  act,
  onConfirming,
  setDefault,
  boardBusy,
  checks,
  onRecheck,
  rechecking,
  runtimePluginMarket,
  onOpenDetail,
}: MarketBodyProps & MarketBodyExtras) {
  const failureOf = (id: string): MarketFailure | null => (failed?.id === id ? failed : null);
  const foot = marketFootVisible(shown, installedList);
  const sections = marketSections(
    marketOrder([...shown, ...installedList], (row) => marketRowTitle(row, t)),
  );
  const installed = sections.find((section) => section.id === 'installed');
  const pendingSection = sections.find((section) => section.id === 'not-installed');
  const common = {
    t,
    onDefault: setDefault,
    boardBusy,
    pending,
    failureOf,
    act,
    confirmActions: CONFIRM_ACTIONS,
    onConfirming,
    onOpenDetail,
    onRecheck,
    rechecking,
  } as const;
  return (
    <>
      {notice === null ? null : <div className={styles.marketNote}>{notice}</div>}
      <MarketSection {...common} rows={self === undefined ? [] : [self]} />
      {self === undefined ? null : (
        <div className={styles.marketSelfDivider} aria-hidden="true" />
      )}
      <MarketSection
        {...common}
        titleKey="panels.market.sectionInstalled"
        icon={marketSectionIcon('installed')}
        rows={installed?.rows ?? NO_ROWS}
        keepHead
        headAction={
          <Fragment>
            {h(MarketUnreadableBadge, { t, rows: unreadable })}
            {checks.modules}
          </Fragment>
        }
      />
      {pendingSection === undefined ? null : (
        <MarketSection
          {...common}
          titleKey={pendingSection.titleKey}
          icon={marketSectionIcon('pending')}
          rows={pendingSection.rows}
        />
      )}
      {runtimePluginMarket === false ? null : (
        <MarketSection
          {...common}
          titleKey="panels.market.sectionPlugins"
          icon={marketSectionIcon('plugins')}
          rows={pluginList}
          headAction={
            <Fragment>
              {checks.plugins}
              {h(UpdateAllPlugins, { t, rows: updatablePlugins(pluginList), act })}
            </Fragment>
          }
        />
      )}

      {foot ? <PanelFoot size="md" text={t('panels.market.foot')} /> : null}
    </>
  );
}

