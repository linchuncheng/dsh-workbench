import { h, useEffect, useRef, useState } from '../../lib/react.js';
import type { FormProps, FormValues } from './FormTypes.js';
import { FormActions } from './FormActions.js';
import { FormRows } from './FormRows.js';
import { Note } from '../feedback/Note.js';
import {
  formActionsOf,
  formProblemsOf,
  formRowsOf,
  formSubmitOf,
  reportDuplicateKeys,
  visibleFieldsOf,
} from './FormNodes.js';
import { revealFirstProblem } from '../../lib/form-problem.js';
import './Form.css';

/**
 * 整张表单：`fields` 进，行、错误、操作区、（被挡住的）提交都由它安排 —— 它自己一个值都不存，
 * 值仍归调用点（`value` 与 `onChange` 写在字段配置的同一格里，`Form` 只是把两者原样递给那一格的 `control`）。
 * 写了 `Form<Values>` 就按 `Values` 把每一格的键与值类型钉住（`Values` 里会 `visible: false` 的键写成可选键）；
 * 不写就是默认档，键值都不钉。
 * 还没提交过时一格错都不显示；第一次提交之后每次渲染重算，改好了当场消。
 * 提交那一拍永远先算一遍：有错就不调 `onSubmit`，并把第一个有错的 `FormRow` 带进视口、聚焦它里面的控件。
 * 回车与点提交钮走的是同一条路：真 `<form>` 的隐式提交在**只有一个文本框**时也会 fire，所以 `busy` / `disabled` 时回车同样不提交。
 * 调用点只管数据与语义：行怎么排、错误摆哪、什么时候校验、按钮在哪，这里没有口子。
 * @returns 一个 `<form>`（`noValidate`：报错形状归 `FormRow`，不走浏览器的气泡）。
 */
export function Form<Values extends object = FormValues>(props: FormProps<Values>) {
  const { fields, onSubmit, submit, cancel, extra, busy = false, disabled = false, problem } = props;
  const [done, setDone] = useState(false);
  const [reveal, setReveal] = useState(0);
  const rootRef = useRef<HTMLFormElement | null>(null);
  const shown = visibleFieldsOf(fields);
  const problems = formProblemsOf(shown, done);

  reportDuplicateKeys(shown);

  useEffect(() => {
    if (reveal === 0) return;
    const root = rootRef.current;
    if (root !== null) revealFirstProblem(root);
  }, [reveal]);

  const submitForm = (): void => {
    if (busy || disabled) return;
    const outcome = formSubmitOf(visibleFieldsOf(fields));
    setDone(true);
    if (outcome.blocked) {
      setReveal((count) => count + 1);
      return;
    }
    onSubmit(outcome.values);
  };

  return (
    <form
      className="wb-form"
      ref={rootRef}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submitForm();
      }}
    >
      <FormRows>{formRowsOf({ fields: shown, problems, showProblem: done, busy })}</FormRows>
      {problem === undefined ? null : h(Note, { tone: 'problem', role: 'alert' }, problem)}
      <FormActions
        actions={formActionsOf({ extra, cancel, submit, busy, disabled, onSubmitClick: submitForm })}
      />
    </form>
  );
}
