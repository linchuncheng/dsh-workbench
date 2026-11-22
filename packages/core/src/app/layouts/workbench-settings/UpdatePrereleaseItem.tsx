import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PrereleaseChannel } from '@/kernel/contract/workbench-settings';
import { PRERELEASE_CHANNELS } from '@/kernel/contract/workbench-settings';
import { SettingsRow } from './SettingsRow';
import { useWorkbenchSettings } from './use-workbench-settings';
import styles from './UpdatePrereleaseItem.module.css';

export interface UpdatePrereleaseItemProps {
  readonly t: Translate;
}

const LABEL_KEYS: Readonly<Record<PrereleaseChannel, string>> = {
  rc: 'updatePrerelease.channel.rc',
  beta: 'updatePrerelease.channel.beta',
  alpha: 'updatePrerelease.channel.alpha',
};

export function UpdatePrereleaseItem({ t }: UpdatePrereleaseItemProps): JSX.Element {
  const settings = useWorkbenchSettings(t, t('updatePrerelease.failed'));
  const [override, setOverride] = useState<readonly PrereleaseChannel[] | null>(null);
  const stored = settings.snapshot?.settings.prereleaseChannels;
  const selected = override ?? stored ?? [];
  const disabled = stored === undefined || settings.busy;

  const toggle = (channel: PrereleaseChannel, next: boolean): void => {
    const wanted = next
      ? PRERELEASE_CHANNELS.filter((one) => selected.includes(one) || one === channel)
      : selected.filter((one) => one !== channel);
    setOverride(wanted);
    void settings.send({ prereleaseChannels: wanted }).then((outcome) => {
      if (!outcome.ok) setOverride(null);
    });
  };

  const summary =
    selected.length === 0
      ? t('updatePrerelease.summaryNone')
      : t('updatePrerelease.summary', { channels: selected.join('、') });

  return (
    <SettingsRow
      title={t('updatePrerelease.nav')}
      description={t('updatePrerelease.lead')}
      error={settings.error}
      control={
        settings.readFailed ? (
          <Button variant="ghost" size="sm" onClick={settings.retry}>
            {t('blocker.retry')}
          </Button>
        ) : undefined
      }
    >
      <div className={styles.channels}>
        {PRERELEASE_CHANNELS.map((channel) => (
          <div key={channel} className={styles.channel}>
            <Switch
              checked={selected.includes(channel)}
              disabled={disabled}
              label={t(LABEL_KEYS[channel])}
              onChange={(next) => toggle(channel, next)}
            />
            <span className={styles.channelLabel}>{t(LABEL_KEYS[channel])}</span>
          </div>
        ))}
      </div>
      <p className={styles.summary}>{summary}</p>
    </SettingsRow>
  );
}
