import { createElement as h, Fragment, useState } from 'react';
import type { BoardModuleProps, CardView } from '@dsh-workbench/shared';
import { Card, CardHead } from '@dsh-workbench/shared';
import { blockerOfError } from '@dsh-workbench/shared';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useCapabilityGate } from '@/shared/hooks/use-capability-gate';
import { useLongTaskWiring } from '@/shared/hooks/use-long-task';
import { SchemaLongTaskView } from './long-task/SchemaLongTaskView';
import { longTaskHandlers } from './long-task/long-task-handlers';
import { useUnitBoard, type CardFeed } from '@/shared/hooks/use-unit-board';
import { SchemaCardView } from './SchemaCardView';

export interface SchemaCardProps extends BoardModuleProps {
  readonly unit: string;
  readonly view: CardView;
}

function useCardFeed(
  view: CardView,
  query: Readonly<Record<string, string | number | boolean | undefined>>,
  enabled: boolean,
  refreshToken: number,
): CardFeed {
  const state = useApiResource<unknown>(view.read.route, query, refreshToken, {
    enabled,
    ...(view.read.fact === undefined ? {} : { fact: view.read.fact }),
  });
  return { state, refreshing: state.phase === 'loading', at: state.at ?? null };
}

function useCardWiring(
  unit: string,
  world: BoardModuleProps['world'],
  enabled: boolean,
): ReturnType<typeof useLongTaskWiring> {
  return useLongTaskWiring({
    unit,
    workspace: world.current.workspace?.path ?? null,
    enabled,
  });
}

export function SchemaCard(props: SchemaCardProps) {
  return props.view.customBody === undefined
    ? h(SchemaReadCard, props)
    : h(SchemaFrameCard, props);
}

function SchemaFrameCard(props: SchemaCardProps) {
  const title = props.t(props.view.titleKey);
  const platform = props.view.platform;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasLongTask = props.view.customLongTask !== undefined;
  const wiring = useCardWiring(props.unit, props.world, hasLongTask);
  const longTasks = wiring.feed;
  const longTask = hasLongTask
    ? h(SchemaLongTaskView, {
        rows: longTasks.runs,
        ...(props.view.customLongTask === undefined
          ? {}
          : { overrides: props.view.customLongTask(longTasks.runs, props.t) }),
        ...longTaskHandlers(wiring, props.t),
      })
    : undefined;
  const head = h(CardHead, {
    t: props.t,
    title,
    refreshing: false,
    onRefresh: props.onRefresh,
    ...(platform === undefined
      ? {}
      : { platformHref: platform.href, platform: props.t(platform.labelKey) }),
    ...(props.view.settingsGearKey === undefined
      ? {}
      : {
          gear: props.t(props.view.settingsGearKey),
          gearOpen: settingsOpen,
          onToggleGear: () => setSettingsOpen((open) => !open),
        }),
  });
  return h(
    Card,
    { t: props.t, title, refreshing: false, onRefresh: props.onRefresh, head },
    h(
      Fragment,
      null,
      props.view.customBody?.(props, {
        settingsOpen,
        onSettingsOpenChange: setSettingsOpen,
      }) ?? null,
      longTask,
    ),
  );
}

function SchemaReadCard(props: SchemaCardProps) {
  const { unit, view } = props;
  const gate = useCapabilityGate(unit, props.refreshToken);
  const readEnabled = view.read.enabled?.(props) ?? true;
  const query =
    typeof view.read.query === 'function' ? view.read.query(props) : (view.read.query ?? {});
  const feed = useCardFeed(view, query, gate.gated && readEnabled, props.refreshToken);
  const board = useUnitBoard({
    unit,
    gate,
    refreshToken: props.refreshToken,
    onRefresh: props.onRefresh,
    onSummary: props.onSummary,
    t: props.t,
    platformBlocker: (error, translate) =>
      blockerOfError(error, translate, {
        ask: { screen: translate('askAgent.screen.board'), step: unit },
      }),
    read: () => feed,
  });
  const hasLongTask = view.sections?.longTask !== undefined;
  const wiring = useCardWiring(unit, props.world, hasLongTask);
  const longTasks = wiring.feed;

  const handlers = longTaskHandlers(wiring, props.t);
  return h(SchemaCardView, {
    ...props,
    state: board.feed.state,
    refreshing: board.feed.refreshing,
    ...(board.blocker === undefined ? {} : { blocker: board.blocker }),
    ...(hasLongTask
      ? {
          longTasks: longTasks.runs,
          longTaskStopping: handlers.stopping,
          longTaskStopFailed: handlers.stopFailed,
          onLongTaskStop: handlers.onStop,
          longTaskRechecking: handlers.rechecking,
          longTaskRecheckFailed: handlers.recheckFailed,
          onLongTaskRecheck: handlers.onRecheck,
          longTaskAnswering: handlers.answering,
          longTaskAnswerFailed: handlers.answerFailed,
          onLongTaskAnswer: handlers.onAnswer,
          onLongTaskLogin: handlers.onLogin,
          onLongTaskOpenUrl: handlers.onOpenUrl,
          onLongTaskCopy: handlers.onCopy,
          longTaskCopied: handlers.copied,
        }
      : {}),
  });
}
