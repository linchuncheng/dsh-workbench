import { Fragment, createElement as h, useId } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { clientSurface } from '@/shared/api/platform/client';
import { ConfigSyncItem } from './ConfigSyncItem';
import { McpOnDemandItem } from './McpOnDemandItem';
import { NewWorkbenchItem } from './NewWorkbenchItem';
import { SettingsGroup } from './SettingsGroup';
import { SidebarEditionItem } from './SidebarEditionItem';
import { settingsPickRow } from './settings-picks';
import { UpdatePrereleaseItem } from './UpdatePrereleaseItem';
import type { SettingsItemId } from './settings-registry';
import {
  SETTINGS_GROUPS,
  settingsEffectText,
  settingsGroupLeadKey,
  settingsGroupTitleKey,
  settingsItemsOf,
} from './settings-registry';
import styles from './WorkbenchSettingsSection.module.css';

const ROW_OF: Readonly<Record<SettingsItemId, (t: Translate, hint: string) => JSX.Element>> = {
  sidebarEdition: (t, hint) => <SidebarEditionItem t={t} hint={hint} />,
  moduleModel: (t, hint) => settingsPickRow(t, 'moduleModel', hint),
  diyPresetSource: (t, hint) => settingsPickRow(t, 'diyPresetSource', hint),
  mcpOnDemand: (t, hint) => <McpOnDemandItem t={t} hint={hint} />,
  prereleaseChannels: (t, hint) => <UpdatePrereleaseItem t={t} hint={hint} />,
};

export function WorkbenchSettingsSection({ t }: { readonly t: Translate }): JSX.Element {
  const desktop = clientSurface().deployment === 'desktop';
  const pageTitleId = useId();
  return (
    <section className={styles.page} aria-labelledby={pageTitleId}>
      <header className={styles.head}>
        <h2 id={pageTitleId} className={styles.title}>{t('workbenchSettings.nav')}</h2>
        <p className={styles.lead}>{t('workbenchSettings.lead')}</p>
      </header>
      <div className={styles.rows}>
        {SETTINGS_GROUPS.map((group) => (
          <SettingsGroup
            key={group}
            title={t(settingsGroupTitleKey(group))}
            note={t(settingsGroupLeadKey(group))}
          >
            {settingsItemsOf(group).map((item) => (
              <Fragment key={item.id}>{ROW_OF[item.id](t, settingsEffectText(t, item))}</Fragment>
            ))}
          </SettingsGroup>
        ))}
        <SettingsGroup
          title={t('workbenchSettings.wholesale')}
          note={t('workbenchSettings.wholesale.lead')}
        >
          <ConfigSyncItem t={t} />
          {desktop ? null : <NewWorkbenchItem t={t} />}
        </SettingsGroup>
      </div>
    </section>
  );
}
