import type { SelectFieldOption } from '@dsh-workbench/shared';
import type { WorkbenchModelChoice, WorkbenchModelGroup } from '@/kernel/contract/workbench-settings';

export interface ModuleModelChoices {
  readonly options: readonly SelectFieldOption[];
  readonly selected: string;
}

export function moduleModelValueOf(choice: WorkbenchModelChoice): string {
  return `${encodeURIComponent(choice.provider)}/${encodeURIComponent(choice.model)}`;
}

export function moduleModelChoiceOf(value: string): WorkbenchModelChoice | undefined {
  if (value === '') return undefined;
  const cut = value.indexOf('/');
  if (cut <= 0 || cut === value.length - 1) return undefined;
  try {
    return {
      provider: decodeURIComponent(value.slice(0, cut)),
      model: decodeURIComponent(value.slice(cut + 1)),
    };
  } catch {
    return undefined;
  }
}

export function moduleModelLabelOf(
  groups: readonly WorkbenchModelGroup[],
  choice: WorkbenchModelChoice,
): string {
  const group = groups.find((one) => one.id === choice.provider);
  const model = group?.models.find((one) => one.id === choice.model);
  return `${group?.name ?? choice.provider}/${model?.name ?? choice.model}`;
}

export function moduleModelChoicesOf(input: {
  readonly groups: readonly WorkbenchModelGroup[];
  readonly stored: WorkbenchModelChoice | null;
  readonly followLabel: string;
  readonly savedLabel: string;
}): ModuleModelChoices {
  const options: SelectFieldOption[] = [{ value: '', label: input.followLabel }];
  let present = false;
  for (const group of input.groups) {
    for (const model of group.models) {
      const choice = { provider: group.id, model: model.id };
      if (input.stored !== null && choice.provider === input.stored.provider && choice.model === input.stored.model) {
        present = true;
      }
      options.push({
        value: moduleModelValueOf(choice),
        label: model.name,
        group: group.name,
        searchText: `${group.name} ${model.name} ${model.id}`,
      });
    }
  }
  if (input.stored !== null && !present) {
    options.push({
      value: moduleModelValueOf(input.stored),
      label: input.savedLabel,
      disabled: true,
      searchText: `${input.stored.provider} ${input.stored.model}`,
    });
  }
  return {
    options,
    selected: input.stored === null ? '' : moduleModelValueOf(input.stored),
  };
}
