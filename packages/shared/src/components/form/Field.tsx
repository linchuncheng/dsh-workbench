import type { ReactNode } from '../../lib/react.js';
import { h } from '../../lib/react.js';
import './Field.css';

/**
 * `Field` 的契约：一行"标签 + 控件 + 说明"的排布。
 */
export interface FieldProps {
  /** 左侧标签，必给。 */
  readonly label: ReactNode;
  /** 控件下面那行说明；不给不画。 */
  readonly hint?: ReactNode | undefined;
  /** 控件本体，落在标签与说明之间。 */
  readonly children?: ReactNode | undefined;
}

/**
 * 标签 + 控件的排布：没进 `FormRow` 时用它兜住一个字段的标签与说明。
 * @returns 一个 `<label>`，点标签会聚焦里面的控件。
 */
export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="wb-field">
      <span className="wb-fieldLabel">{label}</span>
      {children}
      {hint === undefined ? null : <span className="wb-fieldHint">{hint}</span>}
    </label>
  );
}
