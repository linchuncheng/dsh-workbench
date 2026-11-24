import { Component, createElement, type ComponentType, type ReactNode } from 'react';
import { reportEntrySkip } from '../hooks/entry-report';

interface EntryBoundaryProps {
  readonly label: string;
  readonly children?: ReactNode | undefined;
}

interface EntryBoundaryState {
  readonly failed: boolean;
}

class EntryBoundary extends Component<EntryBoundaryProps, EntryBoundaryState> {
  override state: EntryBoundaryState = { failed: false };

  static getDerivedStateFromError(): EntryBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    reportEntrySkip(this.props.label, error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function boundaryOf<P extends object>(label: string, Inner: ComponentType<P>): (props: P) => ReactNode {
  return function Bounded(props: P): ReactNode {
    return createElement(EntryBoundary, { label }, createElement(Inner, props));
  };
}
