import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { cx } from '@dsh-workbench/shared';
import { Tip } from '@/shared/components/Tip';

import { IconNewChatOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { SessionSearch } from './SessionSearch';
import type { SidebarSearch } from './use-sidebar-search';
import styles from './WorkspaceSection.module.css';

function NewSessionButton({
  t,
  onNewSession,
  hidden,
}: {
  readonly t: Translate;
  readonly onNewSession: () => void;
  readonly hidden?: boolean;
}) {
  return (
    <Tip label={t('session.new.label')}>
      <button
        type="button"
        className={cx('wb-iconButton', styles.newSession, hidden === true && styles.newSessionHidden)}
        aria-label={t('session.new')}
        onClick={onNewSession}
      >
        <IconNewChatOutlineRegular size={16} />
      </button>
    </Tip>
  );
}

export interface WorkspaceSectionProps {
  readonly t: Translate;
  readonly wide: boolean;
  readonly onNewSession: () => void;
  readonly search: SidebarSearch;
}

export function WorkspaceSection({ t, wide, onNewSession, search }: WorkspaceSectionProps) {
  return (
    <div className="wb-wsSection">
      <div className="wb-sectionHeader">
        {wide ? (
          <>
            <span className={cx('wb-sectionLabel', styles.label, search.open && styles.labelHidden)}>
              {t('workspace.section')}
            </span>
            <div className={cx(styles.actions, search.open && styles.actionsOpen)}>
              <SessionSearch
                open={search.open}
                query={search.query}
                onOpen={search.onOpen}
                onClose={search.onClose}
                onChange={search.onChange}
                t={t}
              />
              <NewSessionButton t={t} onNewSession={onNewSession} hidden={search.open} />
            </div>
          </>
        ) : (
          <NewSessionButton t={t} onNewSession={onNewSession} />
        )}
      </div>
    </div>
  );
}
