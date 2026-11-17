import type { BrowserCaptureRow } from '@dsh-workbench/shared/host';
import type { RecordCall } from './diy-record-text';

export const SEGMENT_SLACK_MS = 1500;

export type CaptureEntry = BrowserCaptureRow;

export type CaptureRows = (text: string) => readonly BrowserCaptureRow[];

function richerOf(left: CaptureEntry, right: CaptureEntry): CaptureEntry {
  const leftScore = (left.status === 0 ? 0 : 1) + (left.response === '' ? 0 : 1) + (left.ct === '' ? 0 : 1);
  const rightScore = (right.status === 0 ? 0 : 1) + (right.response === '' ? 0 : 1) + (right.ct === '' ? 0 : 1);
  const best = rightScore > leftScore ? right : left;
  const other = best === left ? right : left;
  return {
    ...best,
    request: best.request === '' ? other.request : best.request,
    requestFullSize: best.request === '' ? other.requestFullSize : best.requestFullSize,
    requestSizeExact: best.requestSizeExact || other.requestSizeExact,
    response: best.response === '' ? other.response : best.response,
    responseFullSize: best.response === '' ? other.responseFullSize : best.responseFullSize,
    responseSizeExact: best.responseSizeExact || other.responseSizeExact,
    headers: best.headers === '' ? other.headers : best.headers,
  };
}

export function captureEntriesOf(text: string, rows?: CaptureRows): readonly CaptureEntry[] {
  const out: CaptureEntry[] = [];
  const at = new Map<string, number>();
  const push = (one: CaptureEntry | null): void => {
    if (one === null) return;
    const id = one.key === '' ? `${one.method} ${one.url}@${String(one.at)}` : `${one.key}@${String(one.at)}`;
    const found = at.get(id);
    if (found === undefined) {
      at.set(id, out.length);
      out.push(one);
      return;
    }
    const kept = out[found];
    if (kept !== undefined) out[found] = richerOf(kept, one);
  };
  for (const one of rows === undefined ? [] : rows(text)) push(one);
  return out;
}

export function captureLineOf(calls: readonly RecordCall[]): string {
  if (calls.length === 0) return '';
  const entries = calls.map((one) => ({
    url: one.url,
    method: one.method,
    timestamp: new Date(one.at === 0 ? Date.now() : one.at).toISOString(),
    status: one.status,
    ct: one.ct,
    size: one.response.length,
    key: one.key,
    request: one.body === '' ? {} : { body: one.body },
    body: one.response,
  }));
  return JSON.stringify({ ok: true, data: { entries } });
}

export function segmentOf(
  entries: readonly CaptureEntry[],
  t0: number | null,
  t1: number | null,
): { readonly inside: readonly CaptureEntry[]; readonly outside: number } {
  if (t0 === null || t1 === null) return { inside: entries, outside: 0 };
  const from = t0 - SEGMENT_SLACK_MS;
  const to = t1 + SEGMENT_SLACK_MS;
  const inside: CaptureEntry[] = [];
  let outside = 0;
  for (const one of entries) {
    if (one.at === 0 || (one.at >= from && one.at <= to)) inside.push(one);
    else outside += 1;
  }
  return { inside, outside };
}

export function captureCallsOf(entries: readonly CaptureEntry[]): readonly RecordCall[] {
  return entries.map((one) => ({
    key: one.key,
    method: one.method,
    url: one.url,
    body: one.request,
    status: one.status,
    ct: one.ct,
    response: one.response,
    at: one.at,
    source: 'capture' as const,
  }));
}

function callKeyOf(one: { readonly method: string; readonly url: string }): string {
  return `${one.method} ${one.url}`;
}

export function mergeCalls(
  hook: readonly RecordCall[],
  captured: readonly RecordCall[],
): readonly RecordCall[] {
  const out: RecordCall[] = [...hook];
  const hooks = hook.length;
  const claimed = new Set<number>();
  for (const one of captured) {
    const key = callKeyOf(one);
    let found = -1;
    for (let index = 0; index < hooks; index += 1) {
      if (claimed.has(index)) continue;
      const kept = out[index];
      if (kept === undefined || callKeyOf(kept) !== key) continue;
      if (kept.key !== '' && kept.key !== one.key) continue;
      found = index;
      break;
    }
    if (found === -1) {
      out.push(one);
      continue;
    }
    claimed.add(found);
    const kept = out[found];
    if (kept === undefined) continue;
    out[found] = {
      ...kept,
      key: kept.key === '' ? one.key : kept.key,
      body: kept.body === '' ? one.body : kept.body,
      response: kept.response === '' ? one.response : kept.response,
    };
  }
  return out.sort((left, right) => left.at - right.at);
}

function matchKey(one: CaptureEntry, want: string): boolean {
  if (one.key === want) return true;
  const bare = want.replace(/#\d+$/, '');
  if (one.key.replace(/#\d+$/, '') === bare) return true;
  return callKeyOf(one) === bare;
}

export function pickAllOf(entries: readonly CaptureEntry[], key: string): readonly CaptureEntry[] {
  const want = key.trim();
  if (want === '') return [];
  const exact = entries.filter((one) => one.key === want);
  if (exact.length > 0) return exact;
  return entries.filter((one) => matchKey(one, want));
}

export function pickOf(
  entries: readonly CaptureEntry[],
  key: string,
  at: number | null = null,
): CaptureEntry | null {
  const found = pickAllOf(entries, key);
  const first = found[0];
  if (first === undefined) return null;
  if (at === null) return first;
  let best = first;
  for (const one of found) {
    if (Math.abs(one.at - at) < Math.abs(best.at - at)) best = one;
  }
  return best;
}
