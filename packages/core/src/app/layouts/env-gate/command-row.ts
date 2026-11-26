import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '@dsh-workbench/shared';
import { el, svgIcon } from './gate-dom';
import styles from './BootGate.module.css';

export function commandRow(t: Translate): { row: HTMLElement; set(text: string | undefined): void } {
  const row = el('div', styles.commandRow);
  const code = el('code', styles.command);
  const copy = el('button', styles.copy);
  copy.setAttribute('type', 'button');
  copy.setAttribute('aria-label', t('env.copyCommand'));
  copy.title = t('env.copyCommand');
  copy.append(svgIcon('copy'));
  row.append(code, copy);

  let text: string | undefined;

  copy.addEventListener('click', () => {
    if (text === undefined) return;
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      copy.replaceChildren(svgIcon('check'));
      copy.title = t('env.copied');
      setTimeout(() => {
        copy.replaceChildren(svgIcon('copy'));
        copy.title = t('env.copyCommand');
      }, 1500);
    });
  });

  return {
    row,
    set(next) {
      text = next;
      code.textContent = next ?? '';
      row.hidden = next === undefined;
    },
  };
}
