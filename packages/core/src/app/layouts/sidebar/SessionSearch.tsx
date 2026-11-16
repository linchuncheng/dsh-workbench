import { createElement as h, useEffect, useRef } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { cx } from '@dsh-workbench/shared';
import { IconCloseFillRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';

import styles from './SessionSearch.module.css';

export interface SessionSearchProps {
  readonly open: boolean;
  readonly query: string;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onChange: (query: string) => void;
  readonly t: Translate;
}

export function SessionSearch({ open, query, onOpen, onClose, onChange, t }: SessionSearchProps) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open || query !== '') return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target) === true) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, query, onClose]);

  return (
    <div ref={root} className={cx(styles.search, open && styles.expanded)}>
      <Tip label={t('session.search.label')} disabled={open}>
        <button
          type="button"
          className={styles.button}
          aria-label={t('session.search.label')}
          aria-expanded={open}
          onClick={() => {
            if (!open) onOpen();
            else input.current?.focus({ preventScroll: true });
          }}
        >
          <IconSearchOutlineRegular size={open ? 11 : 14} />
        </button>
      </Tip>
      <input
        ref={input}
        className={styles.input}
        type="text"
        value={query}
        placeholder={t('session.search.placeholder')}
        aria-label={t('session.search.label')}
        autoComplete="off"
        spellCheck={false}
        maxLength={500}
        tabIndex={open ? 0 : -1}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          onClose();
        }}
      />
      {open ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={t('session.search.clear')}
          onClick={onClose}
        >
          <IconCloseFillRegular size={14} />
        </button>
      ) : null}
    </div>
  );
}
