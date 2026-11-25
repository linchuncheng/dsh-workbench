import type { ReactNode } from '../../lib/react.js';
import { Fragment, h } from '../../lib/react.js';
import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Spinner } from '../feedback/Spinner.js';
import './ChoiceGroup.css';

/**
 * 一个候选项：值、人看的标签，可带一行说明。
 */
export interface ChoiceGroupOption {
  /** 给 `onChange` 的值。 */
  readonly value: string;
  /** 人看的标签。 */
  readonly label: ReactNode;
  /** 候选下面那行说明；不给不画。 */
  readonly description?: ReactNode | undefined;
}

/** 单选 / 多选共用的字段：组名、候选、禁用、样式、加载与空态。 */
export interface ChoiceGroupCommon {
  /** 只给读屏的组名（`aria-label`）。 */
  readonly label: string;
  /** 这一组 `input` 的共用 name。 */
  readonly name: string;
  /** 候选项，按给的顺序排；空数组时画 `emptyText`（没给就什么都不画）。 */
  readonly options: readonly ChoiceGroupOption[];
  /** 禁掉整组（默认 false），不是单颗。 */
  readonly disabled?: boolean | undefined;
  /** `boxed`（默认，带边框的选项格）或 `ghost`（无边框，跟着父容器走）。 */
  readonly variant?: 'boxed' | 'ghost' | undefined;
  /** 正在读候选：整组换成转圈，文案取 `loadingText`；默认 false。 */
  readonly loading?: boolean | undefined;
  /** 转圈时那句文案；不给是 `…`。 */
  readonly loadingText?: ReactNode | undefined;
  /** 读到了但一个候选都没有时那句话；不给不画。 */
  readonly emptyText?: ReactNode | undefined;
}

/**
 * 单选那一支的契约：`value` + `onChange(next)`；`multi` 不给或给 false。
 */
export interface ChoiceGroupSingleProps extends ChoiceGroupCommon {
  /** 单选这一支：不给或 false。 */
  readonly multi?: false | undefined;
  /** 当前选中的值。 */
  readonly value: string;
  /** 选了某一项：回它的 `value`。 */
  readonly onChange: (next: string) => void;
}

/**
 * 多选那一支的契约：`multi: true` + `values` + `onChange(next[])`。
 */
export interface ChoiceGroupMultiProps extends ChoiceGroupCommon {
  /** true 走多选那支。 */
  readonly multi: true;
  /** 当前选中的一组 value。 */
  readonly values: readonly string[];
  /** 选了一组：回一组 value。 */
  readonly onChange: (next: readonly string[]) => void;
}

/**
 * `ChoiceGroup` 的契约：单选与多选两支的联合。
 */
export type ChoiceGroupProps = ChoiceGroupSingleProps | ChoiceGroupMultiProps;

interface ChoiceRowState {
  readonly checked: boolean;
  readonly onSelect: () => void;
}

function ChoiceMenu(input: {
  readonly label: string;
  readonly name: string;
  readonly options: readonly ChoiceGroupOption[];
  readonly disabled: boolean;
  readonly multi: boolean;
  readonly variant: 'boxed' | 'ghost';
  readonly loading: boolean;
  readonly loadingText: ReactNode | undefined;
  readonly emptyText: ReactNode | undefined;
  readonly rowOf: (value: string) => ChoiceRowState;
}) {
  const body = input.loading ? (
    <span className="wb-choiceLoading" role="status">
      <Spinner size={14} />
      <span className="wb-choiceLoadingText">{input.loadingText ?? '…'}</span>
    </span>
  ) : input.options.length === 0 ? (
    input.emptyText === undefined ? null : (
      <span className="wb-choiceEmpty">{input.emptyText}</span>
    )
  ) : (
    input.options.map((option) => {
      const row = input.rowOf(option.value);
      return (
        <Fragment key={option.value}>
          <label
            className={`wb-choiceOption${row.checked ? ' wb-choiceOptionOn' : ''}`}
          >
            <input
              className={input.multi ? 'wb-checkbox' : 'wb-radio'}
              type={input.multi ? 'checkbox' : 'radio'}
              name={input.name}
              checked={row.checked}
              disabled={input.disabled}
              onChange={row.onSelect}
            />
            {input.multi ? (
              <span
                className="wb-checkboxBox"
                aria-hidden="true"
              >
                {row.checked ? <IconCheckOutlineRegular size={12} /> : null}
              </span>
            ) : null}
            <span className="wb-choiceLabel">
              <span className="wb-choiceLabelText">{option.label}</span>
              {option.description === undefined ? null : (
                <span className="wb-choiceDescription">{option.description}</span>
              )}
            </span>
          </label>
        </Fragment>
      );
    })
  );

  return (
    <div
      className="wb-choiceMenu"
      data-variant={input.variant}
      role={input.multi ? 'group' : 'radiogroup'}
      aria-label={input.label}
      aria-busy={input.loading ? true : undefined}
    >
      {body}
    </div>
  );
}

/**
 * 一组单选或多选：候选少、要一眼看全时用它；候选多或要搜索就用 `SelectField`。
 * @returns 一组 `radio` / `checkbox` 选项。
 */
export function ChoiceGroup(props: ChoiceGroupProps) {
  const common = {
    label: props.label,
    name: props.name,
    options: props.options,
    disabled: props.disabled === true,
    variant: props.variant ?? 'boxed',
    loading: props.loading === true,
    loadingText: props.loadingText,
    emptyText: props.emptyText,
  };

  if (props.multi === true) {
    const values = props.values;
    const onChange = props.onChange;
    return (
      <ChoiceMenu
        label={common.label}
        name={common.name}
        options={common.options}
        disabled={common.disabled}
        multi={true}
        variant={common.variant}
        loading={common.loading}
        loadingText={common.loadingText}
        emptyText={common.emptyText}
        rowOf={(value) => ({
          checked: values.includes(value),
          onSelect: () => {
            onChange(
              values.includes(value)
                ? values.filter((one) => one !== value)
                : [...values, value],
            );
          },
        })}
      />
    );
  }

  const value = props.value;
  const onChange = props.onChange;
  return (
    <ChoiceMenu
      label={common.label}
      name={common.name}
      options={common.options}
      disabled={common.disabled}
      multi={false}
      variant={common.variant}
      loading={common.loading}
      loadingText={common.loadingText}
      emptyText={common.emptyText}
      rowOf={(option) => ({
        checked: option === value,
        onSelect: () => {
          onChange(option);
        },
      })}
    />
  );
}
