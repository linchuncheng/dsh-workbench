import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconWarningOutlineRegular, MarkdownText, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { markdownLabelsOf } from '../market/discover-doc';
import { unreadableBadgeText, unreadableLead, unreadableTitle, type UnreadableModuleRow } from './market-unreadable-text';
import styles from './MarketUnreadableBadge.module.css';

function lineOf(row: UnreadableModuleRow): string {
  return row.pkg === '' ? row.reason : `${row.pkg}：${row.reason}`;
}

function markdownOf(t: Translate, rows: readonly UnreadableModuleRow[]): string {
  const items = rows.map((row) => (row.pkg === '' ? `- ${row.reason}` : `- \`${row.pkg}\`：${row.reason}`));
  return [unreadableLead(t), '', ...items].join('\n');
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
        <span className={styles.icon}>
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
        </span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={unreadableTitle(t)}
        tone="warning"
        closeLabel={t('market.unreadable.close')}
        footer={
          <Button type="button" size="sm" variant="primary" onClick={copyAll}>
            {copied ? t('market.unreadable.copied') : t('market.unreadable.copy')}
          </Button>
        }
      >
        <MarkdownText text={markdownOf(t, rows)} labels={markdownLabelsOf(t)} variant="compact" />
      </Modal>
    </span>
  );
}
