import { createElement as h, useId } from 'react';
import type { ReactNode } from 'react';
import styles from './SettingsGroup.module.css';

export interface SettingsGroupProps {
  readonly title: string;
  readonly note?: string | undefined;
  readonly children: ReactNode;
}

export function SettingsGroup({ title, note, children }: SettingsGroupProps): JSX.Element {
  const titleId = useId();
  return (
    <section className={styles.group} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>{title}</h3>
      {note === undefined ? null : <p className={styles.note}>{note}</p>}
      <div className={styles.rows}>{children}</div>
    </section>
  );
}
