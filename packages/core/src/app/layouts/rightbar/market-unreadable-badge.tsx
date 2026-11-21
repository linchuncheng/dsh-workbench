import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconWarningOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { unreadableBadgeText, unreadableLead, unreadableTitle, type UnreadableModuleRow } from './market-unreadable-text';
import styles from './MarketUnreadableBadge.module.css';

function lineOf(row: UnreadableModuleRow): string {
  return row.pkg === '' ? row.reason : `${row.pkg}：${row.reason}`;
}

export function MarketUnreadableBadge({
  t,
  rows,
}: {
  readonly t: Translate;
  readonly rows: readonly UnreadableModuleRow[];
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (rows.length === 0) return null;

  const copyAll = (): void => {
    void globalThis.navigator?.clipboard?.writeText(rows.map(lineOf).join('\n')).then(() => {
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span className={styles.seat}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label={unreadableBadgeText(t, rows.length)}
        title={unreadableBadgeText(t, rows.length)}
        onClick={() => setOpen(true)}
      >
        <IconWarningOutlineRegular size={14} aria-hidden="true" />
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={unreadableTitle(t)}
        tone="warning"
        description={unreadableLead(t)}
        closeLabel={t('market.unreadable.close')}
        footer={
          <Button type="button" size="sm" variant="primary" onClick={copyAll}>
            {copied ? t('market.unreadable.copied') : t('market.unreadable.copy')}
          </Button>
        }
      >
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={`${row.pkg}:${row.reason}`} className={styles.line}>
              {lineOf(row)}
            </li>
          ))}
        </ul>
      </Modal>
    </span>
  );
}
