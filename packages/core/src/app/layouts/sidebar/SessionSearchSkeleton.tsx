import { Fragment, createElement as h } from 'react';
import { cx } from '@dsh-workbench/shared';

import styles from './SessionSearchSkeleton.module.css';

export interface SessionSearchSkeletonProps {
  readonly rows: number;
}

export function SessionSearchSkeleton({ rows }: SessionSearchSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <div className={styles.row} key={index} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.bars}>
            <span className={styles.bar} />
            <span className={cx(styles.bar, styles.wide)} />
          </span>
        </div>
      ))}
    </>
  );
}
