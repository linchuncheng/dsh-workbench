import type { Translate } from '@dsh-workbench/shared';
import type { LongTaskWiring } from '@/shared/hooks/use-long-task';
import type { SchemaLongTaskViewProps } from './SchemaLongTaskView';

export type LongTaskViewHandlers = Omit<SchemaLongTaskViewProps, 'rows' | 'overrides'>;

export function longTaskHandlers(
  wiring: LongTaskWiring,
  t: Translate,
): LongTaskViewHandlers {
  const feed = wiring.feed;
  return {
    stopping: feed.stopping,
    stopFailed: feed.stopFailed,
    rechecking: feed.rechecking,
    recheckFailed: feed.recheckFailed,
    answering: feed.answering,
    answerFailed: feed.answerFailed,
    t,
    onStop: (id: string) => {
      void feed.stop(id);
    },
    onRecheck: (id: string) => {
      void feed.recheck(id);
    },
    onAnswer: (id: string, values: Readonly<Record<string, string>>) => {
      void feed.answer(id, values);
    },
    onLogin: wiring.open,
    onOpenUrl: wiring.open,
    onCopy: wiring.copy,
    copied: wiring.copied,
  };
}
