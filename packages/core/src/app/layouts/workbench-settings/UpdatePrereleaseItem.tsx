import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PrereleaseChannel } from '@/kernel/contract/workbench-settings';
import { PRERELEASE_CHANNELS } from '@/kernel/contract/workbench-settings';
import { SettingsControl } from './SettingsControl';
import { SettingsRow } from './SettingsRow';
import { useWorkbenchSettings } from './use-workbench-settings';
import styles from './UpdatePrereleaseItem.module.css';

export interface UpdatePrereleaseItemProps {
  readonly t: Translate;
  readonly hint?: string | undefined;
}

const LABEL_KEYS: Readonly<Record<PrereleaseChannel, string>> = {
  rc: 'updatePrerelease.channel.rc',
  beta: 'updatePrerelease.channel.beta',
  alpha: 'updatePrerelease.channel.alpha',
};

function isChannel(value: string): value is PrereleaseChannel {
  return (PRERELEASE_CHANNELS as readonly string[]).includes(value);
}

export function UpdatePrereleaseItem({ t, hint }: UpdatePrereleaseItemProps): JSX.Element {
  const settings = useWorkbenchSettings(t, t('updatePrerelease.failed'));
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<readonly PrereleaseChannel[] | null>(null);
  const stored = settings.snapshot?.settings.prereleaseChannels;
  const selected = override ?? stored ?? [];
  const disabled = stored === undefined || settings.busy;

  const toggle = (id: string): void => {
    if (!isChannel(id)) return;
    const wanted = selected.includes(id)
      ? selected.filter((one) => one !== id)
      : PRERELEASE_CHANNELS.filter((one) => selected.includes(one) || one === id);
    setOverride(wanted);
    void settings.send({ prereleaseChannels: wanted }).then((outcome) => {
      if (!outcome.ok) setOverride(null);
    });
  };

  const items: readonly MenuEntry[] = PRERELEASE_CHANNELS.map((channel) => ({
    id: channel,
    label: t(LABEL_KEYS[channel]),
  }));

  return (
    <SettingsRow
      title={t('updatePrerelease.nav')}
      description={t('updatePrerelease.lead')}
      hint={hint}
      error={settings.error}
      control={
        <SettingsControl t={t} readFailed={settings.readFailed} onRetry={settings.retry}>
          <Menu
            open={open}
            onClose={() => setOpen(false)}
            items={items}
            selectedIds={selected}
            onSelect={toggle}
            portal
            anchor={
              <button
                type="button"
                className={styles.select}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={t('updatePrerelease.pick')}
                onClick={() => setOpen((value) => !value)}
              >
                <span className={styles.value}>
                  {selected.length === 0
                    ? t('updatePrerelease.none')
                    : selected.join(t('updatePrerelease.separator'))}
                </span>
                <span className={styles.chevron} aria-hidden="true">
                  <IconChevronDownOutlineRegular size={14} />
                </span>
              </button>
            }
          />
        </SettingsControl>
      }
    />
  );
}
