import type { ReactNode } from '../../lib/react.js';
import type { Translate } from '../../lib/dsh-client.js';
import {
  Button,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
  IconSettingsOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { h } from '../../lib/react.js';
import './CardHead.css';

/**
 * `CardHead` 的契约：标题、补充、刷新，外加齿轮与平台跳转两格。
 */
export interface CardHeadProps {
  /** 刷新那两句文案（刷新 / 刷新中）的翻译函数。 */
  readonly t: Translate;
  /** 卡标题；`props.meta` 是它右侧那一小段补充，不给不占位。 */
  readonly title: string;
  /** 标题右侧那一小段补充（条数、时间）；不给不占位。 */
  readonly meta?: ReactNode | undefined;
  /** 正在刷新：刷新钮禁用并转圈。 */
  readonly refreshing: boolean;
  /** 点刷新钮做什么。 */
  readonly onRefresh: () => void;
  /** 齿轮钮的读屏名；`gearOpen` 控制它高亮、`onToggleGear` 是点击回调，三者一起给才画。 */
  readonly gear?: string | undefined;
  /** 齿轮钮是不是打开状态；和 `gear` / `onToggleGear` 一起给才画。 */
  readonly gearOpen?: boolean | undefined;
  /** 点齿轮钮的回调。 */
  readonly onToggleGear?: (() => void) | undefined;
  /** 整张卡对应系统的地址：给了就画那颗 ↗（新窗口），tooltip 用 `platformTitle`，缺了退化用 `platform`。 */
  readonly platformHref?: string | undefined;
  /** 整张卡对应系统的名字；`platformTitle` 不给时当 tooltip。 */
  readonly platform?: string | undefined;
  /** ↗ 那颗钮的 tooltip；不给退化成 `platform`。 */
  readonly platformTitle?: string | undefined;
}

/**
 * 卡头：标题 + 补充 + 刷新钮（`Card` 内部就是它），要自己拼卡头或加齿轮 / 平台跳转时直接用。
 * @returns 一个 `<header>`。
 */
export function CardHead({
  t,
  title,
  meta,
  refreshing,
  onRefresh,
  gear,
  gearOpen,
  onToggleGear,
  platformHref,
  platform,
  platformTitle,
}: CardHeadProps) {
  const refreshLabel = refreshing ? t('rightbar.refreshing') : t('rightbar.refresh');
  const platformLabel = platformTitle ?? platform ?? t('rightbar.openPlatform');
  return (
    <header className="wb-cardHead">
      <h2 className="wb-cardTitle">{title}</h2>
      {meta === undefined ? null : <span className="wb-cardMeta">{meta}</span>}
      {platformHref === undefined ? null : (
        <Tooltip side="bottom" align="end" gap={6} portal label={platformLabel}>
          <a
            className="wb-iconButton wb-cardOpen"
            href={platformHref}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={platform ?? platformLabel}
          >
            <IconRightUpOutlineRegular size={14} />
          </a>
        </Tooltip>
      )}
      <Tooltip side="bottom" align="end" gap={6} portal label={refreshLabel}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={`wb-cardRefresh${refreshing ? ' wb-spinning' : ''}`}
          aria-label={refreshLabel}
          disabled={refreshing}
          icon={<IconRefreshOutlineRegular size={14} />}
          onClick={onRefresh}
        />
      </Tooltip>
      {gear === undefined || onToggleGear === undefined ? null : (
        <Tooltip side="bottom" align="end" gap={6} portal label={gear}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={`wb-cardGear${gearOpen === true ? ' wb-iconButtonActive' : ''}`}
            aria-label={gear}
            aria-expanded={gearOpen === true}
            icon={<IconSettingsOutlineRegular size={15} />}
            onClick={onToggleGear}
          />
        </Tooltip>
      )}
    </header>
  );
}
