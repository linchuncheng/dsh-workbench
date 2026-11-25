import type { ReactNode } from '../../lib/react.js';
import { h } from '../../lib/react.js';
import './FormRows.css';

/**
 * `FormRows` 的契约：一列 `FormRow` 的容器。
 */
export interface FormRowsProps {
  /** 一串 `FormRow`；非行的孩子（如分组标题）自动通栏。 */
  readonly children?: ReactNode | undefined;
}

/**
 * 表单行的容器：同一份 `FormRows` 共用一个标签列（列宽由最长的标签定），行距也归它。
 * @returns 竖排的 div。
 */
export function FormRows({ children }: FormRowsProps) {
  return <div className="wb-formRows">{children}</div>;
}

/**
 * `FormRow` 的契约：标签、提示、错误与控件的排布。
 */
export interface FormRowProps {
  /** 这一行的标签；进了这一行，控件自己就别再给 `label`，否则会多一个标签。 */
  readonly label: ReactNode;
  /** 标签挂到哪个控件（同一个 `id`）；不给就只是排布，点标签不聚焦 —— `Form` 会自己接好。 */
  readonly htmlFor?: string | undefined;
  /** 控件下的说明；给了 `problem` 就不画它 —— 同一格不叠两段话。 */
  readonly hint?: ReactNode | undefined;
  /** 校验失败那句话；给了就顶掉 `hint` 并给整行加上出错标记。 */
  readonly problem?: ReactNode | undefined;
  /** `stacked` 才是标签在上、控件在下（默认 `inline`：标签在左）。 */
  readonly layout?: 'inline' | 'stacked' | undefined;
  /** 控件本体。 */
  readonly children?: ReactNode | undefined;
}

/**
 * 表单一行：左边标签、右边控件，提示与错误占控件下面那一格。
 * @returns 一个 `<div>`：里面的 `<label>` 只包标签文字，不包控件、提示与整行的空白。
 */
export function FormRow({ label, htmlFor, hint, problem, layout = 'inline', children }: FormRowProps) {
  return (
    <div
      className="wb-formRow"
      data-layout={layout}
      data-wb-problem={problem === undefined ? undefined : ''}
    >
      <label className="wb-formLabel" htmlFor={htmlFor}>
        {label}
      </label>
      <span className="wb-formControl">{children}</span>
      {problem === undefined ? (
        hint === undefined ? null : (
          <span className="wb-formHint">{hint}</span>
        )
      ) : (
        <span className="wb-formProblem">{problem}</span>
      )}
    </div>
  );
}
