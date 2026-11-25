import { createElement as h } from 'react';
import type { CardViewLongTask, ShellLongTaskRow, Translate } from '@dsh-workbench/shared';
import { useLongTaskWiring } from '@/shared/hooks/use-long-task';
import { SchemaLongTaskView } from './SchemaLongTaskView';
import { longTaskHandlers } from './long-task-handlers';

export interface LongTaskRunProps {
  /** 单元 id。 */
  readonly unit: string;
  /** 当前工作区；`null` 时不读。 */
  readonly workspace: string | null;
  /** 要画的那一趟（来自模块自己的 `useLongTask` 或工作台）。 */
  readonly run: ShellLongTaskRow;
  /** 词表。 */
  readonly t: Translate;
  /** 标题覆盖；不给用 run 自带的那句。 */
  readonly headline?: string | undefined;
  /** 行尾链接覆盖（`labelKey` 走词表）；与 run 自带链接按 `href` 合并。 */
  readonly links?: CardViewLongTask['links'] | undefined;
}

/**
 * 一条长任务的自接线行：模块把它放进自己的 DOM，读、停、重查、回执、登录、打开链接都归它。
 * 读是单飞的，与外壳那一节共用同一条轮询。
 * @returns 一行长任务；`run` 为空时不画。
 */
export function LongTaskRun(props: LongTaskRunProps) {
  const wiring = useLongTaskWiring({ unit: props.unit, workspace: props.workspace });
  const overrides: CardViewLongTask[] | undefined =
    props.headline === undefined && props.links === undefined
      ? undefined
      : [
          {
            id: props.run.id,
            ...(props.headline === undefined ? {} : { headline: props.headline }),
            ...(props.links === undefined ? {} : { links: props.links }),
          },
        ];
  return h(SchemaLongTaskView, {
    rows: [props.run],
    ...(overrides === undefined ? {} : { overrides }),
    ...longTaskHandlers(wiring, props.t),
  });
}
