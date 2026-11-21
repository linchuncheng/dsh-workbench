import type { SelectFieldOption, Translate } from '@dsh-workbench/shared';
import type { WorkbenchDiyPresetSource } from '@/kernel/contract/workbench-settings';

const BUILT_IN_KEYS: Readonly<Record<string, string>> = {
  standard: 'diyPresetSource.standard',
  ptc: 'diyPresetSource.ptc',
  minimal: 'diyPresetSource.minimal',
  cordis: 'diyPresetSource.cordis',
};

export function diyPresetLabelOf(t: Translate, source: WorkbenchDiyPresetSource): string {
  const key = source.name === null ? BUILT_IN_KEYS[source.id] : undefined;
  return key === undefined ? (source.name ?? source.id) : t(key);
}

export interface DiyPresetChoices {
  readonly options: readonly SelectFieldOption[];
  readonly selected: string;
  readonly unavailable: boolean;
}

export function diyPresetChoicesOf(input: {
  readonly t: Translate;
  readonly sources: readonly WorkbenchDiyPresetSource[];
  readonly stored: string;
}): DiyPresetChoices {
  const options: SelectFieldOption[] = [];
  let present = false;
  for (const source of input.sources) {
    const label = diyPresetLabelOf(input.t, source);
    if (source.id === input.stored) present = true;
    options.push({
      value: source.id,
      label: source.usable ? label : input.t('diyPresetSource.unusable', { name: label }),
      searchText: `${source.id} ${source.name ?? ''} ${label}`,
      ...(source.usable ? {} : { disabled: true }),
    });
  }
  if (!present) {
    options.push({
      value: input.stored,
      label: input.t('diyPresetSource.unusable', { name: input.stored }),
      disabled: true,
      searchText: input.stored,
    });
  }
  const selected = options.find((option) => option.value === input.stored);
  return { options, selected: input.stored, unavailable: selected?.disabled === true };
}
