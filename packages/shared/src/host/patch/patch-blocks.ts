import { isSeq, LineCounter, parseDocument } from 'yaml';

export interface PatchBlock {
  readonly key: string;
  readonly id: string;
  readonly insert: boolean;
  readonly body: string;
  readonly names: readonly string[];
}

export interface SpannedBlock extends PatchBlock {
  readonly from: number;
  readonly to: number;
}

const ID_LINE = /^- id:[ \t]*"?([^"\s#]+)/;
const INSERT_LINE = /^- insert:[ \t]*$/;
const NESTED_ID = /^[ \t]+-[ \t]*id:[ \t]*"?([^"\s#]+)/;
const NAME_LINE = /^[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\s#]+)/;

function trimmedTail(lines: readonly string[]): readonly string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return lines.slice(0, end);
}

function matched(text: string, pattern: RegExp): string | undefined {
  const found = pattern.exec(text);
  return found === null ? undefined : found[1];
}

export function nestedIdsOf(body: string): readonly string[] {
  return body.split('\n').flatMap((line) => {
    const one = matched(line, NESTED_ID);
    return one === undefined ? [] : [one];
  });
}

function blockOf(body: string, index: number): PatchBlock {
  const lines = body.split('\n');
  const first = lines[0] ?? '';
  const id = matched(first, ID_LINE);
  const nested = nestedIdsOf(body);
  const insert = id === undefined && INSERT_LINE.test(first);
  const label = id ?? nested.join(', ');
  const key = id !== undefined ? `id:${id}` : insert ? `insert:${nested.join(', ')}` : `block:${String(index)}`;
  const names = lines.flatMap((line) => {
    const one = matched(line, NAME_LINE);
    return one === undefined ? [] : [one];
  });
  return { key, id: label === '' ? key : label, insert, body, names };
}

export function spannedBlocks(text: string): SpannedBlock[] {
  const lines = text.split(/\r?\n/);
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter, logLevel: 'silent' });
  if (document.errors.length > 0) {
    throw new Error(`cordis.patch.yml 无法解析：${document.errors[0]?.message ?? '原因不明'}`);
  }
  const items = isSeq(document.contents) ? document.contents.items : [];
  const starts = items.flatMap((item) =>
    item.range === null ? [] : [lineCounter.linePos(item.range[0]).line - 1],
  );
  const blocks: SpannedBlock[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i] ?? 0;
    const to = i + 1 < starts.length ? (starts[i + 1] ?? lines.length) : lines.length;
    const body = trimmedTail(lines.slice(from, to)).join('\n');
    if (body.trim() === '') continue;
    blocks.push({ ...blockOf(body, blocks.length), from, to });
  }
  return blocks;
}

export function patchBlocks(text: string): PatchBlock[] {
  return spannedBlocks(text).map(({ from: _from, to: _to, ...block }) => block);
}
