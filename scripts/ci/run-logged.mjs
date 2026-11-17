import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

export async function runLogged({ root, label, file, args, pattern }) {
  const result = await execa(file, args, { cwd: root, reject: false });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(join(root, `${label}.log`), text);
  if (result.exitCode === 0) return true;
  console.log(text.split('\n').slice(-40).join('\n'));
  const picked = text.split('\n').filter((line) => pattern.test(line)).slice(0, 20);
  const fallback = text.split('\n').filter((line) => line.trim() !== '').slice(-12);
  const body = (picked.length > 0 ? picked : fallback)
    .map((line) => `${line.replaceAll('%', '%25').replaceAll('\r', '')}%0A`)
    .join('');
  console.log(`::error title=${label} failed::${body.slice(0, 1800)}`);
  return false;
}
