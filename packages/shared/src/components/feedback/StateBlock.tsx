import type { ReactNode } from '../../lib/react.js';
import { h } from '../../lib/react.js';
import './StateBlock.css';

/**
 * `StateBlock` 的契约：标题、状态点、提示、正文与行尾动作。
 */
export interface StateBlockProps {
  /** 标题那行；它与 `dot` 都不给时整行不画。 */
  readonly title?: ReactNode | undefined;
  /** 标题前那枚状态点。 */
  readonly dot?: ReactNode | undefined;
  /** 标题下那行小字（如"3 条 · 刚刚"）；不给不画。 */
  readonly hint?: ReactNode | undefined;
  /** 底部动作区；给了才画那一条。 */
  readonly actions?: ReactNode | undefined;
  /** "正在读"那行，读数期间挂上去；不给不画。 */
  readonly resolving?: ReactNode | undefined;
  /** 正文。 */
  readonly children?: ReactNode | undefined;
}

/**
 * 有内容那一段：一个标题 + 一行提示 + 正文，卡里已经读到东西时用它开头。
 * @returns 一个 div。
 */
export function StateBlock({ title, dot, hint, actions, resolving, children }: StateBlockProps) {
  return (
    <div className="wb-stateBlock">
      {title === undefined && dot === undefined ? null : (
        <p className="wb-stateBlockTitle">
          {dot}
          {title}
        </p>
      )}
      {resolving === undefined ? null : <p className="wb-stateBlockResolving">{resolving}</p>}
      {hint === undefined ? null : <p className="wb-stateBlockHint">{hint}</p>}
      {children}
      {actions === undefined ? null : <div className="wb-stateBlockActions">{actions}</div>}
    </div>
  );
}
