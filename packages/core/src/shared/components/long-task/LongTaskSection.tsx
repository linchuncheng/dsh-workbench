import { createElement as h } from 'react';
import type { CardViewLongTask, ShellLongTaskRow, Translate } from '@dsh-workbench/shared';
import { useLongTaskWiring } from '@/shared/hooks/use-long-task';
import { SchemaLongTaskView } from './SchemaLongTaskView';
import { longTaskHandlers } from './long-task-handlers';

export interface LongTaskSectionProps {
  /** 单元 id。 */
  readonly unit: string;
  /** 当前工作区；`null` 时不读。 */
  readonly workspace: string | null;
  /** 词表。 */
  readonly t: Translate;
  /** 只画哪些 run；不给就全画。 */
  readonly filter?: ((run: ShellLongTaskRow) => boolean) | undefined;
  /** 标题 / 行尾链接覆盖（`labelKey` 走词表）。 */
  readonly overrides?:
    | ((runs: readonly ShellLongTaskRow[]) => readonly CardViewLongTask[])
    | undefined;
}

/**
 * 一个单元的长任务列表：读、写、干预全接好，模块只要给单元、工作区与词表。
 * 读是单飞的，与卡片那一节、模块自己的 `useLongTask` 共用同一条轮询。
 * @returns 这一单元的长任务；没有就是 `null`。
 */
export function LongTaskSection(props: LongTaskSectionProps) {
  const wiring = useLongTaskWiring({ unit: props.unit, workspace: props.workspace });
  const rows =
    props.filter === undefined ? wiring.feed.runs : wiring.feed.runs.filter(props.filter);
  if (rows.length === 0) return null;
  return h(SchemaLongTaskView, {
    rows,
    ...(props.overrides === undefined ? {} : { overrides: props.overrides(rows) }),
    ...longTaskHandlers(wiring, props.t),
  });
}
