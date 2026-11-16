import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { cx } from '@dsh-workbench/shared';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { sessionStatuses, type SessionNode } from '@/modules/sessions';

import styles from './SessionSearchResult.module.css';

export interface SessionSearchResultProps {
  readonly node: SessionNode;
  readonly workspace: string;
  readonly snippet?: string | undefined;
  readonly active: boolean;
  readonly onOpen: (sessionId: string) => void;
  readonly t: Translate;
}

export function SessionSearchResult({
  node,
  workspace,
  snippet,
  active,
  onOpen,
  t,
}: SessionSearchResultProps) {
  const statuses = sessionStatuses(node, t);
  const primary = statuses[0];

  return (
    <div
      className={cx(styles.result, active && styles.selected)}
      role="treeitem"
      aria-selected={active}
      tabIndex={0}
      onClick={() => onOpen(node.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        onOpen(node.id);
      }}
    >
      <span className={styles.heading}>
        <span className={styles.slot}>
          {primary === undefined || primary.state === 'idle' ? null : (
            <StateDot state={primary.state} />
          )}
          {statuses.map((status) => (
            <span className="wb-visuallyHidden" key={status.label}>
              {status.label}
            </span>
          ))}
        </span>
        <span className={styles.title}>{node.title}</span>
      </span>
      <span className={styles.meta}>
        <span className={styles.workspace}>{workspace}</span>
        {snippet === undefined || snippet === '' ? null : (
          <span className={styles.snippet}>{snippet}</span>
        )}
      </span>
    </div>
  );
}
