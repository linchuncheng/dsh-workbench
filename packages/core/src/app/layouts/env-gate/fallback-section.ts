import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '@dsh-workbench/shared';
import styles from './BootGate.module.css';
import type { FallbackCard } from './fault-card';
import { el } from './gate-dom';

export function fallbackSectionOf(t: Translate, skipLabel: string) {
  const root = el('div', styles.bridge);
  root.hidden = true;
  const title = el('h2', styles.fixTitle, t('askAgent.title'));
  const facts = el('ul', styles.bridgeLines);
  const hint = el('p', styles.hint);
  hint.hidden = true;
  const copy = el('button', styles.button, t('askAgent.copy')) as HTMLButtonElement;
  copy.setAttribute('type', 'button');
  const retry = el('button', styles.button, t('env.retry')) as HTMLButtonElement;
  retry.setAttribute('type', 'button');
  const skip = el('button', styles.button, skipLabel) as HTMLButtonElement;
  skip.setAttribute('type', 'button');
  const buttons = el('div', styles.buttons);
  buttons.append(copy, retry, skip);
  root.append(title, facts, hint, buttons);
  let prompt = '';
  copy.addEventListener('click', () => {
    if (prompt === '') return;
    void writeClipboard(prompt).then((ok) => {
      if (!ok) return;
      copy.textContent = t('askAgent.copied');
      setTimeout(() => {
        copy.textContent = t('askAgent.copy');
      }, 1500);
    });
  });
  return {
    root,
    onRetry(handler: () => void) {
      retry.addEventListener('click', handler);
    },
    onSkip(handler: () => void) {
      skip.addEventListener('click', handler);
    },
    setDisabled(disabled: boolean) {
      if (disabled) retry.setAttribute('disabled', '');
      else retry.removeAttribute('disabled');
    },
    set(card: FallbackCard) {
      prompt = card.prompt;
      title.textContent = card.title;
      facts.replaceChildren(...card.facts.map((text) => el('li', styles.bridgeLine, text)));
      hint.textContent = card.hint ?? '';
      hint.hidden = card.hint === undefined;
      root.hidden = false;
    },
  };
}
