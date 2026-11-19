import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MESSAGE_FILES = ['src/messages.ts', 'src/messages.tsx', 'src/messages.mjs', 'src/messages.js'];

function titleIn(segment, key) {
  const quoted = `['"\`]${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`;
  const match = new RegExp(`${quoted}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`).exec(segment);
  return match === null ? '' : match[1].trim();
}

export function cardTitleFromMessages(root, unit) {
  if (unit === '') return undefined;
  const key = `${unit}.cardTitle`;
  for (const file of MESSAGE_FILES) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const zhAt = text.search(/\bzh\s*:/);
    const enAt = text.search(/\ben\s*:/);
    const zh = zhAt === -1 ? '' : titleIn(text.slice(zhAt, enAt === -1 ? text.length : enAt), key);
    const en = enAt === -1 ? '' : titleIn(text.slice(enAt), key);
    if (zh === '' && en === '') continue;
    return { ...(zh === '' ? {} : { zh }), ...(en === '' ? {} : { en }) };
  }
  return undefined;
}
