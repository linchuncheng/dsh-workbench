import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';

import styles from './SessionOverflow.module.css';

export interface SessionOverflowProps {
  readonly hiddenCount: number;
  readonly expanded: boolean;
  readonly onExpand: () => void;
  readonly onCollapse: () => void;
  readonly t: Translate;
}

export function SessionOverflow({
  hiddenCount,
  expanded,
  onExpand,
  onCollapse,
  t,
}: SessionOverflowProps) {
  return (
    <button
      type="button"
      className={styles.overflow}
      aria-expanded={expanded}
      onClick={expanded ? onCollapse : onExpand}
    >
      {expanded ? t('session.collapse') : t('session.expand', { n: hiddenCount })}
    </button>
  );
}
