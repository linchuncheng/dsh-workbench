import type { ReactNode } from '../../lib/react.js';
import { h } from '../../lib/react.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { CenteredState } from '../feedback/ResourceStates.js';
import { Note } from '../feedback/Note.js';
import { SaveBar } from '../form/SaveBar.js';
import styles from './SetupShell.module.css';

/**
 * 初始化的一步：渲染什么、能不能走、走去哪、走之前存什么。
 */
/** 初始化的一步。 */
export interface SetupStep {
  /** 步骤 id；`initialStep` / `next` 用它。 */
  readonly id: string;
  /** 步骤标题。 */
  readonly title: string;
  /** 画这一步。 */
  readonly render: (ctx: SetupStepContext) => ReactNode;
  /** 能不能走下一步；不给默认 true。 */
  readonly canLeave?: ((values: Readonly<Record<string, unknown>>) => boolean) | undefined;
  /** 下一步 id；返回 null 表示没有下一步（走完成）。 */
  readonly next?: ((values: Readonly<Record<string, unknown>>) => string | null) | undefined;
  /** 这一步单独保存；不给则没有这一步的保存钮。 */
  readonly submit?:
    | ((values: Readonly<Record<string, unknown>>) => Promise<SetupWriteResult>)
    | undefined;
}

/**
 * 每步的渲染上下文：当前值、改值、忙碌与错误。
 */
export interface SetupStepContext {
  /** 当前值。 */
  readonly values: Readonly<Record<string, unknown>>;
  /** 改值。 */
  readonly setValues: (next: Record<string, unknown>) => void;
  /** 正在保存。 */
  readonly busy: boolean;
  /** 上一条错误；没有是 null。 */
  readonly error: string | null;
}

/**
 * 一次配置读取的结果：`configured` 为真表示已经不用再初始化，`values` 是已存的值。
 */
export interface SetupSnapshot {
  /** 已经配置好，不用再初始化。 */
  readonly configured: boolean;
  /** 已存的值。 */
  readonly values?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * 一次配置写入的结果。
 */
export type SetupWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code?: string | undefined; readonly message: string };

/**
 * 初始化流程的归一化相位：正在读 / 要配置 / 已就绪 / 读不到。
 */
export type SetupPhase = 'checking' | 'needs-setup' | 'ready' | 'blocked';

/**
 * `useUnitSetup` 交出来的那台机器；`SetupShell` 只认这一个形状。
 */
/** `useUnitSetup` 交出来的状态机。 */
export interface UnitSetup {
  /** 现在在哪一相。 */
  readonly phase: SetupPhase;
  /** 全部步骤。 */
  readonly steps: readonly SetupStep[];
  /** 当前步骤；相位不是 `needs-setup` 时可能没有。 */
  readonly step: SetupStep | undefined;
  /** 当前值。 */
  readonly values: Readonly<Record<string, unknown>>;
  /** 改值。 */
  readonly setValues: (next: Record<string, unknown>) => void;
  /** 正在保存。 */
  readonly busy: boolean;
  /** 上一条错误；没有是 null。 */
  readonly error: string | null;
  /** 当前步能不能走。 */
  readonly canLeave: boolean;
  /** 能不能回上一步。 */
  readonly canBack: boolean;
  /** 下一步（先运行当前步的 `submit`）。 */
  readonly next: () => void;
  /** 回上一步。 */
  readonly back: () => void;
  /** 重读配置。 */
  readonly retry: () => void;
  /** `edit` 模式一次存全量；没给 `write` 时无效。 */
  readonly saveAll: () => void;
}

/**
 * `SetupShell` 自己那几句文案；模块按自己的词表给。
 */
export interface SetupShellLabels {
  /** 上一步。 */
  readonly back: string;
  /** 下一步。 */
  readonly next: string;
  /** 完成。 */
  readonly finish: string;
  /** 保存。 */
  readonly save: string;
  /** 保存中。 */
  readonly saving: string;
  /** 取消。 */
  readonly cancel: string;
  /** 正在读。 */
  readonly reading: string;
  /** 读不到。 */
  readonly failed: string;
}

/**
 * `<SetupShell>` 的 prop：一台 `useUnitSetup` 的机器、文案、以及完成后的主页。
 */
export interface SetupShellProps {
  /** `useUnitSetup` 的返回值；壳不自己取数、不自己写配置。 */
  readonly setup: UnitSetup;
  /** 八句文案：上一步 / 下一步 / 完成 / 保存 / 保存中 / 取消 / 正在读 / 读不到。 */
  readonly labels: SetupShellLabels;
  /** `setup`（默认，分步）或 `edit`（同一步骤集合摊成一页，底部 `SaveBar`）。 */
  readonly mode?: 'setup' | 'edit' | undefined;
  /** 相位到 `ready` 时渲染什么；不给就只留空。 */
  readonly renderHome?: (() => ReactNode) | undefined;
  /** `edit` 模式点取消做什么；不给钮就什么都不做。 */
  readonly onCancel?: (() => void) | undefined;
}

/**
 * 初始化 / 配置的外壳：分步、上一步 / 下一步 / 完成、阻断与错误，完成之后把主页换进来。
 * @returns 一块初始化或配置界面。
 */
export function SetupShell({
  setup,
  labels,
  mode = 'setup',
  renderHome,
  onCancel,
}: SetupShellProps) {
  if (setup.phase === 'checking') {
    return <CenteredState icon={null} title={labels.reading} />;
  }
  if (setup.phase === 'blocked') {
    return (
      <CenteredState
        icon={null}
        title={labels.failed}
        {...(setup.error === null ? {} : { detail: setup.error })}
      />
    );
  }
  if (mode === 'edit') {
    return editForm(setup, labels, onCancel);
  }
  if (setup.phase === 'ready') {
    return renderHome === undefined ? null : renderHome();
  }
  const step = setup.step;
  if (step === undefined) return null;
  const index = setup.steps.findIndex((candidate) => candidate.id === step.id);
  const last = index === setup.steps.length - 1;
  return (
    <div className={styles.setup}>
      <ol className={styles.steps}>
        {setup.steps.map((candidate, at) => (
          <li
            key={candidate.id}
            className={
              at === index
                ? `${styles.step} ${styles.stepActive}`
                : at < index
                  ? `${styles.step} ${styles.stepDone}`
                  : styles.step
            }
            aria-current={at === index ? 'step' : undefined}
          >
            <span className={styles.stepIndex}>{at + 1}</span>
            <span className={styles.stepTitle}>{candidate.title}</span>
          </li>
        ))}
      </ol>
      <div className={styles.body}>{step.render(stepContext(setup))}</div>
      {setup.error === null ? null : (
        <Note tone="problem">{setup.error}</Note>
      )}
      <div className={styles.actions}>
        {setup.canBack ? (
          <Button type="button" variant="outline" size="sm" onClick={setup.back}>
            {labels.back}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!setup.canLeave || setup.busy}
          onClick={setup.next}
        >
          {last ? labels.finish : labels.next}
        </Button>
      </div>
    </div>
  );
}

function editForm(
  setup: UnitSetup,
  labels: SetupShellLabels,
  onCancel: (() => void) | undefined,
): ReactNode {
  return (
    <div className={styles.edit}>
      {setup.steps.map((step) => (
        <section key={step.id} className={styles.editSection}>
          <h3 className={styles.editTitle}>{step.title}</h3>
          {step.render(stepContext(setup))}
        </section>
      ))}
      {setup.error === null ? null : (
        <Note tone="problem">{setup.error}</Note>
      )}
      <SaveBar
        busy={setup.busy}
        labels={{ cancel: labels.cancel, save: labels.save, saving: labels.saving }}
        onCancel={onCancel ?? noop}
        onSave={setup.saveAll}
      />
    </div>
  );
}

function stepContext(setup: UnitSetup): SetupStepContext {
  return {
    values: setup.values,
    setValues: setup.setValues,
    busy: setup.busy,
    error: setup.error,
  };
}

function noop(): void {}
