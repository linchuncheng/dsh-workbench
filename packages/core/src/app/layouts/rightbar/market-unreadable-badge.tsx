import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, HoverCard, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { unreadableBadgeText, unreadableLead, unreadableTitle } from './market-unreadable-text';
import styles from './MarketUnreadableBadge.module.css';

export function MarketUnreadableBadge({
  t,
  lines,
}: {
  readonly t: Translate;
  readonly lines: readonly string[];
}): JSX.Element | null {
  if (lines.length === 0) return null;
  const content = (
    <div className={styles.card}>
      <p className={styles.title}>{unreadableTitle(t)}</p>
      <p className={styles.lead}>{unreadableLead(t)}</p>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line} className={styles.line}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <HoverCard
      variant="compact"
      copyText={lines.join('\n')}
      copyLabel={t('market.unreadable.copy')}
      copiedLabel={t('market.unreadable.copied')}
      anchor={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={unreadableBadgeText(t, lines.length)}
          title={unreadableBadgeText(t, lines.length)}
        >
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
        </Button>
      }
      content={content}
    />
  );
}
