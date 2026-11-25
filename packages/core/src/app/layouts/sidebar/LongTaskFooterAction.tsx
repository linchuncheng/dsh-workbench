import { createElement as h, useState } from 'react';
import type { ShellLongTaskRow, Translate } from '@dsh-workbench/shared';
import { answerRouteOf, recheckRouteOf, stopRouteOf } from '@dsh-workbench/shared';
import { Menu, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import { postWrite } from '@/shared/hooks/use-host-write';
import { useExternalActions } from '@/shared/hooks/use-external-actions';
import { useShellLongTasks } from '@/shared/hooks/use-shell-long-tasks';
import { SchemaLongTaskView } from '@/shared/components/long-task/SchemaLongTaskView';
import styles from './LongTaskFooterAction.module.css';

export interface LongTaskFooterActionProps {
  readonly wide?: boolean | undefined;
  readonly t: Translate;
}

type DoneKind = 'stop' | 'recheck' | 'answer';

interface Busy {
  readonly kind: DoneKind;
  readonly id: string;
}

interface Failed extends Busy {
  readonly text: string;
}

const NETWORK: Readonly<Record<DoneKind, string>> = {
  stop: '网络不通，停止请求没发出去',
  recheck: '网络不通，重查请求没发出去',
  answer: '网络不通，回执没交出去',
};

const URL_PATTERN = /^https?:\/\//i;

function failedTextOf(failed: Failed | null, kind: DoneKind, id: string): string | null {
  return failed?.kind === kind && failed.id === id ? failed.text : null;
}

function resourceOf(kind: DoneKind, unit: string): string {
  if (kind === 'stop') return stopRouteOf(unit);
  if (kind === 'recheck') return recheckRouteOf(unit);
  return answerRouteOf(unit);
}

export function LongTaskFooterAction({ wide, t }: LongTaskFooterActionProps) {
  const rows = useShellLongTasks();
  const external = useExternalActions(() => undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);

  if (rows.length === 0) return null;

  const waiting = rows.some((row) => row.status === 'needs-human' || row.status === 'needs-login');
  const byUnit = new Map<string, ShellLongTaskRow[]>();
  for (const row of rows) {
    const list = byUnit.get(row.unit);
    if (list === undefined) byUnit.set(row.unit, [row]);
    else list.push(row);
  }

  const run = async (kind: DoneKind, row: ShellLongTaskRow, body: Record<string, unknown>): Promise<void> => {
    setBusy({ kind, id: row.id });
    setFailed(null);
    try {
      const outcome = await postWrite('actions', resourceOf(kind, row.unit), body, NETWORK[kind]);
      if (!outcome.ok) setFailed({ kind, id: row.id, text: outcome.message });
    } finally {
      setBusy((current) => (current?.kind === kind && current.id === row.id ? null : current));
    }
  };

  const busyIdOf = (kind: DoneKind, id: string): string | null =>
    busy?.kind === kind && busy.id === id ? id : null;
  const openSafe = (url: string): void => {
    if (URL_PATTERN.test(url)) external.open(url);
  };

  const entry = h(
    'button',
    {
      type: 'button',
      className: wide === true ? styles.entryWide : styles.entry,
      'aria-label': t('longTask.list.entry', { n: rows.length }),
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      onClick: () => setOpen((value) => !value),
    },
    h('span', { className: styles.dot }, h(StateDot, { state: waiting ? 'warning' : 'ongoing' })),
    wide === true ? h('span', { className: styles.label }, t('longTask.list.entry', { n: rows.length })) : null,
  );

  return h(
    Menu,
    {
      open,
      onClose: () => setOpen(false),
      portal: true,
      autoFocus: true,
      className: styles.anchor,
      listClassName: styles.menu,
      anchor: entry,
    },
    h('div', { className: styles.title }, t('longTask.list.title')),
    h(
      'div',
      { className: styles.list },
      ...[...byUnit].map(([unit, unitRows]) =>
        h(
          'section',
          { key: unit, className: styles.group },
          h('div', { className: styles.groupTitle }, unit),
          ...unitRows.map((row) =>
            h(SchemaLongTaskView, {
              key: row.id,
              rows: [row],
              stopping: busyIdOf('stop', row.id),
              stopFailed: failedTextOf(failed, 'stop', row.id),
              rechecking: busyIdOf('recheck', row.id),
              recheckFailed: failedTextOf(failed, 'recheck', row.id),
              answering: busyIdOf('answer', row.id),
              answerFailed: failedTextOf(failed, 'answer', row.id),
              t,
              onStop: (id: string) => {
                void run('stop', row, { id });
              },
              onRecheck: (id: string) => {
                void run('recheck', row, { id });
              },
              onAnswer: (id: string, values: Readonly<Record<string, string>>) => {
                void run('answer', row, { id, values });
              },
              onLogin: openSafe,
              onOpenUrl: openSafe,
              onCopy: external.copy,
              copied: external.copied,
            }),
          ),
        ),
      ),
    ),
  );
}
