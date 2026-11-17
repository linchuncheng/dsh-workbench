import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';

import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './ModulesPage.module.css';

export interface PanelRowUnit {
  readonly id: string;
  readonly shown: boolean;
}

export type PanelRowKind = 'panel' | 'background';

const ON_KEY: Readonly<Record<PanelRowKind, string>> = {
  panel: 'panels.onBoard',
  background: 'panels.enabled',
};

const OFF_KEY: Readonly<Record<PanelRowKind, string>> = {
  panel: 'panels.offBoard',
  background: 'panels.disabled',
};

export interface PanelRowControlsProps {
  readonly t: Translate;
  readonly unit: PanelRowUnit;
  readonly label: string;
  readonly kind?: PanelRowKind | undefined;
  readonly busy: boolean;
  readonly onWrite: (body: Record<string, unknown>) => void;
}

export function PanelRowControls({
  t,
  unit,
  label,
  kind = 'panel',
  busy,
  onWrite,
}: PanelRowControlsProps) {
  return (
    <span className={styles.rowControls}>
      <Switch
        checked={unit.shown}
        label={`${label} · ${t(unit.shown ? ON_KEY[kind] : OFF_KEY[kind])}`}
        disabled={busy}
        onChange={(next) => onWrite({ action: next ? 'show' : 'hide', id: unit.id })}
      />
    </span>
  );
}
