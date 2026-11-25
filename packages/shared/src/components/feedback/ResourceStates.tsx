import type { ReactNode } from 'react';
import { h } from '../../lib/react.js';
import { EmptyIllustration } from './EmptyIllustration.js';
import './ResourceStates.css';

/** 骨架屏的约定：只差行数。 */
export interface SkeletonRowsProps {
  /** 画几行骨架（默认 4）；整块 `aria-hidden`，不读给读屏。 */
  readonly rows?: number | undefined;
}

/**
 * 骨架屏：读数期间已经知道大概形状时用它（连形状都不知道就用 `CenteredState` 那句"正在读"）。
 * @returns 一叠占位条。
 */
export function SkeletonRows({ rows = 4 }: SkeletonRowsProps) {
  return (
    <div className="wb-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="wb-skeletonRow">
          <span className="wb-skeletonBar wb-skeletonBarTitle" />
          <span className="wb-skeletonBar wb-skeletonBarMeta" />
        </span>
      ))}
    </div>
  );
}

/**
 * `CenteredState` 的契约：图标、标题、说明、明细与动作。
 */
export interface CenteredStateProps {
  /** 标题上方那枚图标；给 `null` 就只留标题（加载与报错常见）。 */
  icon: ReactNode;
  /** 正中那行大字。 */
  title: ReactNode;
  /** 标题下的一行说明。 */
  hint?: string;
  /** 更细的一行（如原始错误码与那句话）；"读不到"时把错误放这里，绝不显示 0。 */
  detail?: string;
  /** 底部动作（如"重试"）；不给不画。 */
  action?: ReactNode;
  /** 紧凑档（默认 false），卡里空间小的时候给 true。 */
  compact?: boolean;
}

/**
 * 居中一屏：要他先选一个 / 正在读 / 读不到时用它占住卡片版面。
 * @returns 一个 `role="status"` 的居中块。
 */
export function CenteredState({ icon, title, hint, detail, action, compact = false }: CenteredStateProps) {
  return (
    <div className={compact ? 'wb-centered wb-centeredCompact' : 'wb-centered'} role="status">
      {icon === null ? null : (
        <span className="wb-centeredHero" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="wb-centeredTitle">{title}</div>
      {hint === undefined ? null : <div className="wb-centeredHint">{hint}</div>}
      {detail === undefined ? null : <div className="wb-centeredDetail">{detail}</div>}
      {action === undefined ? null : <div className="wb-centeredAction">{action}</div>}
    </div>
  );
}

/** 空态的约定：一句话 + 图标 + 紧凑档。 */
export interface EmptyStateProps {
  /** 空态那句话。 */
  readonly text: string;
  /** 标题上方的图标；不给就用空态插画，要纯文字给 `null`。 */
  readonly icon?: ReactNode | undefined;
  /** 紧凑档，默认 false。 */
  readonly compact?: boolean | undefined;
}

/**
 * 就绪但空：它只是 `CenteredState` 的简写，标题就是那句空态文案。
 * @returns 一个居中块。
 */
export function EmptyState({
  text,
  icon = h(EmptyIllustration, { size: 72 }),
  compact = false,
}: EmptyStateProps) {
  return <CenteredState icon={icon} title={text} compact={compact} />;
}
