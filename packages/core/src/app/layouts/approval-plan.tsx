import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './approval-detail.module.css';

export function planShots(
  args: Readonly<Record<string, unknown>>,
): readonly { caption: string; ascii: string }[] {
  const raw = args['shots'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((one) => {
    if (typeof one !== 'object' || one === null) return [];
    const shot = one as { caption?: unknown; ascii?: unknown };
    const caption = typeof shot.caption === 'string' ? shot.caption.trim() : '';
    const ascii = typeof shot.ascii === 'string' ? shot.ascii : '';
    return ascii.trim() === '' ? [] : [{ caption, ascii }];
  });
}

export function planSections(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly { label: string; items: readonly string[] }[] {
  const sections: { label: string; items: readonly string[] }[] = [];
  for (const [key, label] of [
    ['see', 'approval.plan.see'],
    ['do', 'approval.plan.do'],
    ['agent', 'approval.plan.agent'],
    ['data', 'approval.plan.data'],
  ] as const) {
    const raw = args[key];
    const items = Array.isArray(raw)
      ? raw.flatMap((one) => (typeof one === 'string' && one.trim() !== '' ? [one.trim()] : []))
      : [];
    if (items.length > 0) sections.push({ label: t(label), items });
  }
  return sections;
}

export function PlanCard({
  args,
  t,
}: {
  readonly args: Readonly<Record<string, unknown>>;
  readonly t: Translate;
}) {
  return (
    <>
      {planShots(args).map((shot, index) => (
        <div className={styles.shot} key={String(index)}>
          <CodeBlock
            code={shot.ascii}
            lang={shot.caption}
            copyLabel={t('markdown.copy')}
            copiedLabel={t('env.copied')}
          />
        </div>
      ))}
      {planSections(args, t).map((section) => (
        <div className={styles.shot} key={section.label}>
          <p className={styles.shotCaption}>{section.label}</p>
          <ul className={styles.shotItems}>
            {section.items.map((item, index) => (
              <li className={styles.shotItem} key={String(index)}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
