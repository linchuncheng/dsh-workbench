import { DEFAULT_WORKSPACE_TITLE } from '@dsh-workbench/shared';
import { isWorkshopPath } from '@/shared/api/diy';
import { basenameOf } from './workspace-name';

export type WorkspaceSectionId = 'workspaces' | 'defaultWorkspace' | 'workshop';

export interface WorkspaceHeadings {
  readonly workspaces: string;
  readonly defaultWorkspace: string;
  readonly workshop: string;
}

export interface WorkspaceSectionPlan<T> {
  readonly id: WorkspaceSectionId;
  readonly heading: string | null;
  readonly items: readonly T[];
}

export interface WorkspaceSectionOptions<T> {
  readonly rankOf?: ((item: T) => number | null) | undefined;
  readonly recencyOf?: ((item: T) => number) | undefined;
}

const FLOATING_RANK = 0;

const HEADINGS_MIN_ITEMS = 4;

function isDefaultWorkspace(item: { readonly path: string; readonly title: string }): boolean {
  return item.title === DEFAULT_WORKSPACE_TITLE || basenameOf(item.path) === DEFAULT_WORKSPACE_TITLE;
}

export function workspaceSections<T extends { readonly path: string; readonly title: string }>(
  items: readonly T[],
  headings: WorkspaceHeadings,
  options: WorkspaceSectionOptions<T> = {},
): readonly WorkspaceSectionPlan<T>[] {
  const workspaces: T[] = [];
  const defaults: T[] = [];
  const workshop: T[] = [];
  for (const item of items) {
    if (isWorkshopPath(item.path)) workshop.push(item);
    else if (isDefaultWorkspace(item)) defaults.push(item);
    else workspaces.push(item);
  }
  const { rankOf, recencyOf } = options;
  const rank = (item: T): number => rankOf?.(item) ?? Number.POSITIVE_INFINITY;
  const recency = (item: T): number => recencyOf?.(item) ?? 0;
  const ordered = (rows: readonly T[]): readonly T[] => {
    if (rankOf === undefined && recencyOf === undefined) return rows;
    const position = new Map(rows.map((row, at) => [row, at]));
    return [...rows].sort(
      (left, right) =>
        rank(left) - rank(right) ||
        recency(right) - recency(left) ||
        (position.get(left) ?? 0) - (position.get(right) ?? 0),
    );
  };
  const special = defaults.length > 0 || workshop.length > 0;
  const sections: WorkspaceSectionPlan<T>[] = [];
  if (workspaces.length > 0) {
    sections.push({ id: 'workspaces', heading: special ? headings.workspaces : null, items: ordered(workspaces) });
  }
  if (defaults.length > 0) {
    sections.push({ id: 'defaultWorkspace', heading: headings.defaultWorkspace, items: ordered(defaults) });
  }
  if (workshop.length > 0) {
    sections.push({ id: 'workshop', heading: headings.workshop, items: ordered(workshop) });
  }
  const titled = (plan: readonly WorkspaceSectionPlan<T>[]): readonly WorkspaceSectionPlan<T>[] =>
    items.length >= HEADINGS_MIN_ITEMS && plan.length > 1
      ? plan
      : plan.map((section) => ({ ...section, heading: null }));
  if (rankOf === undefined) return titled(sections);
  const sectionRank = (section: WorkspaceSectionPlan<T>): number => Math.min(...section.items.map(rank));
  const floating = sections.filter((section) => sectionRank(section) === FLOATING_RANK);
  const rest = sections.filter((section) => sectionRank(section) !== FLOATING_RANK);
  return titled([...floating, ...rest]);
}
