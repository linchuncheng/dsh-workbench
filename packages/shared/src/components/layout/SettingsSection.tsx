import type { ReactNode } from '../../lib/react.js';
import { h } from '../../lib/react.js';
import './SettingsSection.css';

/**
 * `SettingsSection` 的契约：一节的读屏名、标题、右上动作与内容。
 */
export interface SettingsSectionProps {
  /** 只给读屏的组名（`aria-label`），不是标题。 */
  readonly label: string;
  /** 人看的标题。 */
  readonly title: ReactNode;
  /** 标题右侧的动作（如"添加"）；不给不占位。 */
  readonly action?: ReactNode | undefined;
  /** 这一节的内容。 */
  readonly children?: ReactNode | undefined;
}

/**
 * 设置面里的一节：标题 + 右上那颗动作 + 一节内容，把一屏设置分组。
 * @returns 一个 `role="group"` 的 section。
 */
export function SettingsSection({ label, title, action, children }: SettingsSectionProps) {
  return (
    <section className="wb-settings" role="group" aria-label={label}>
      <header className="wb-settingsHead">
        <span className="wb-settingsTitle">{title}</span>
        {action}
      </header>
      {children}
    </section>
  );
}
