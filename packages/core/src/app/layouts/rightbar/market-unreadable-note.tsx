import { createElement as h } from 'react';
import styles from '../market/MarketPage.module.css';

export function MarketUnreadableNote({ text }: { readonly text: string }) {
  return <div className={styles.marketNote}>{text}</div>;
}
