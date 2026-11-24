import { Component, createElement, type ComponentType, type ReactNode } from 'react';
import { createCopyFlash, faultPromptOf, firstLineOf, type Translate } from '@dsh-workbench/shared';
import { reasonOf, reportEntrySkip } from '../hooks/entry-report';
import styles from './EntryBoundary.module.css';

const COPIED_MS = 1500;

interface EntryBoundaryProps {
  readonly label: string;
  readonly t?: Translate | undefined;
  readonly children?: ReactNode | undefined;
}

interface EntryBoundaryState {
  readonly failed: boolean;
  readonly reason: string;
  readonly copied: boolean;
}

export function entryPromptOf(label: string, reason: string, t: Translate): string {
  const cause = firstLineOf(reason);
  return faultPromptOf(
    {
      screen: t('askAgent.screen.workbench'),
      step: label,
      problem: { why: t('entry.failed'), ...(cause === undefined ? {} : { reason: cause }) },
    },
    t,
  );
}

export class EntryBoundary extends Component<EntryBoundaryProps, EntryBoundaryState> {
  override state: EntryBoundaryState = { failed: false, reason: '', copied: false };

  private readonly flash = createCopyFlash(COPIED_MS);

  static getDerivedStateFromError(error: unknown): EntryBoundaryState {
    return { failed: true, reason: reasonOf(error), copied: false };
  }

  override componentDidCatch(error: unknown): void {
    reportEntrySkip(this.props.label, error);
  }

  override componentWillUnmount(): void {
    this.flash.dispose();
  }

  private readonly copyPrompt = (): void => {
    if (this.props.t === undefined) return;
    this.flash.copy(entryPromptOf(this.props.label, this.state.reason, this.props.t), (copied) =>
      this.setState({ copied }),
    );
  };

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const t = this.props.t;
    if (t === undefined) return null;
    return createElement(
      'span',
      { className: styles.failed, role: 'status' },
      createElement('span', null, t('entry.failed')),
      createElement(
        'button',
        { type: 'button', className: 'wb-link', onClick: this.copyPrompt },
        this.state.copied ? t('askAgent.copied') : t('askAgent.copy'),
      ),
      this.state.copied ? createElement('span', { className: styles.hint }, t('askAgent.hint')) : null,
    );
  }
}

export function boundaryOf<P extends object>(label: string, Inner: ComponentType<P>): (props: P) => ReactNode {
  return function Bounded(props: P): ReactNode {
    const t = (props as { readonly t?: Translate | undefined }).t;
    return createElement(
      EntryBoundary,
      { label, ...(t === undefined ? {} : { t }) },
      createElement(Inner, props),
    );
  };
}
