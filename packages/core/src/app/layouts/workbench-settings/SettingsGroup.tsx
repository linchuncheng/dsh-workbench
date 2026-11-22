import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import { SettingsSection } from '@dsh-workbench/shared';
import styles from './SettingsGroup.module.css';

export function SettingsGroup({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note?: string | undefined;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <SettingsSection label={title} title={title}>
      {note === undefined ? null : <p className={styles.note}>{note}</p>}
      <div className={styles.rows}>{children}</div>
    </SettingsSection>
  );
}
