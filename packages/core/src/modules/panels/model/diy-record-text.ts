import type { RecordExpect, RecordMove, RecordRefusal, RecordState } from '@dsh-workbench/shared/host';

import {
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_STOP_TOOL,
} from '../unit';

const CALLS_SHOWN = 12;

export interface RecordCall {
  readonly key: string;
  readonly method: string;
  readonly url: string;
  readonly body: string;
  readonly status: number;
  readonly ct: string;
  readonly response: string;
  readonly at: number;
  readonly source: 'hook' | 'capture';
}

export interface RecordPageRead {
  readonly ok: boolean;
  readonly code: string;
  readonly phase: string;
  readonly t0: number | null;
  readonly t1: number | null;
  readonly href: string;
  readonly here: string;
  readonly dropped: number;
  readonly hooked: boolean | null;
  readonly unhooked: boolean;
  readonly shots: number;
  readonly calls: readonly RecordCall[];
  readonly snap: RecordSnapRead | null;
}

export interface RecordSnapRead {
  readonly href: string;
  readonly title: string;
  readonly bytes: number;
  readonly truncated: boolean;
  readonly at: number;
  readonly fields: number;
  readonly required: readonly string[];
}

export function recordPageOf(payload: Record<string, unknown> | undefined): RecordPageRead {
  const raw = payload ?? {};
  const calls: RecordCall[] = [];
  const rows = Array.isArray(raw['calls']) ? raw['calls'] : [];
  for (const one of rows) {
    if (typeof one !== 'object' || one === null) continue;
    const row = one as Record<string, unknown>;
    calls.push({
      key: '',
      method: typeof row['method'] === 'string' ? row['method'] : '',
      url: typeof row['url'] === 'string' ? row['url'] : '',
      body: typeof row['body'] === 'string' ? row['body'] : '',
      status: typeof row['status'] === 'number' ? row['status'] : 0,
      ct: typeof row['ct'] === 'string' ? row['ct'] : '',
      response: typeof row['response'] === 'string' ? row['response'] : '',
      at: typeof row['at'] === 'number' ? row['at'] : 0,
      source: 'hook',
    });
  }
  const phase = typeof raw['phase'] === 'string' ? raw['phase'] : 'none';
  return {
    ok: raw['ok'] === true,
    code: typeof raw['code'] === 'string' ? raw['code'] : '',
    phase,
    t0: typeof raw['t0'] === 'number' ? raw['t0'] : null,
    t1: typeof raw['t1'] === 'number' ? raw['t1'] : null,
    href: typeof raw['href'] === 'string' ? raw['href'] : '',
    here: typeof raw['here'] === 'string' ? raw['here'] : '',
    dropped: typeof raw['dropped'] === 'number' ? raw['dropped'] : 0,
    hooked: typeof raw['hooked'] === 'boolean' ? raw['hooked'] : null,
    shots: typeof raw['shots'] === 'number' ? raw['shots'] : 0,
    unhooked: raw['unhooked'] === 1 || raw['unhooked'] === true,
    calls,
    snap: snapOf(raw['snap']),
  };
}

function snapOf(raw: unknown): RecordSnapRead | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const box = raw as Record<string, unknown>;
  const required = Array.isArray(box['required'])
    ? box['required'].filter((one): one is string => typeof one === 'string').slice(0, 20)
    : [];
  return {
    href: typeof box['href'] === 'string' ? box['href'] : '',
    title: typeof box['title'] === 'string' ? box['title'] : '',
    bytes: typeof box['bytes'] === 'number' ? box['bytes'] : 0,
    truncated: box['truncated'] === true,
    at: typeof box['at'] === 'number' ? box['at'] : 0,
    fields: typeof box['fields'] === 'number' ? box['fields'] : 0,
    required,
  };
}

export function filterTextOf(expect: RecordExpect | null): string {
  const want = expect;
  if (want === null || (want.method === '' && want.urlContains === '')) return '';
  const parts: string[] = [];
  if (want.method !== '') parts.push(want.method);
  if (want.urlContains !== '') parts.push(`url 含 ${want.urlContains}`);
  return parts.join(' · ');
}

export function armFailureText(input: {
  readonly raw: string;
  readonly code: string;
  readonly part: number;
  readonly parts: number;
}): string {
  const raw = input.raw.trim();
  const where = `第 ${String(input.part)}/${String(input.parts)} 段`;
  if (/too long|E2BIG|argument list too long/i.test(raw)) {
    return `录制条注入失败：${where}命令超过 Windows 的命令行上限（8191 字符）。重试无效；把这条原文与 Windows 版本报告给维护者。`;
  }
  if (raw === '') {
    const code = input.code === '' ? '页面没有返回结果' : input.code;
    return `录制条注入失败：${where}没有生效（${code}）。等页面加载完成后再试；仍然失败就报告给维护者。`;
  }
  return `录制条注入失败：${where}报错 ${raw}。等页面加载完成后再试；仍然失败就运行运行时自检（doctor），确认扩展是否已连接。`;
}

export function probeCommandOf(calls: readonly RecordCall[]): string {
  const pick = calls.find((one) => one.body !== '');
  if (pick === undefined) return '';
  return `${pick.method} ${pick.url}\n${pick.body.slice(0, 400)}`;
}

export function bodyMissingOf(calls: readonly RecordCall[]): boolean {
  return calls.length > 0 && calls.every((one) => one.body === '');
}

const PHASE_WORD: Readonly<Record<RecordState['phase'], string>> = {
  armed: '已就绪，等待开始',
  recording: '录制中',
  finished: '录制已完成',
};

export function recordRefusalText(code: RecordRefusal, held?: RecordState): string {
  switch (code) {
    case 'held-by-other':
      return `另一场录制尚未结束（${held === undefined ? '另一个会话' : held.sessionId}）。一台机器同时只允许一场录制：让该会话先调用 ${DIY_RECORD_STOP_TOOL} 结束，或等待它结束。`;
    case 'already-held':
      return `本会话已有一场录制（${held === undefined ? '' : `${held.unit}，${PHASE_WORD[held.phase]}`}）。一台机器同时只允许一场录制：要换目标或再录一段，先调用 ${DIY_RECORD_STOP_TOOL}，再调用 ${DIY_RECORD_PREPARE_TOOL}；新的一场会再次询问用户。`;
    case 'not-owner':
      return '这一场录制不属于本会话。只有开始录制的会话才能结束它。';
    case 'none':
      return '当前没有正在进行的录制。';
    case 'already-recording':
      return '本场正在录制。让用户按「结束录制」，再调用本工具。';
    case 'not-armed':
      return `这一段录制已经结束。要再录一段，直接调用 ${DIY_RECORD_PREPARE_TOOL}（上一段会结束，上一个窗口会收起）。`;
    case 'not-recording':
      return '页面尚未开始录制。等页面加载完成后再调用。';
    case 'not-finished':
      return `这一段录制尚未结束。等用户按「结束录制」，再调用 ${DIY_RECORD_READ_TOOL} 或 ${DIY_RECORD_STOP_TOOL}。`;
  }
}

export function recordMissingText(): string {
  return `当前没有正在进行的录制（${DIY_RECORD_PREPARE_TOOL} 开始的那一场可能已过期或结束）。先调用 ${DIY_RECORD_PREPARE_TOOL}。`;
}

export function recordTalkOf(): string {
  return '已开始录制';
}

export interface RecordListRow {
  readonly index: number;
  readonly key: string;
  readonly at: number;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly ct: string;
  readonly size: number;
  readonly source: 'hook' | 'capture';
  readonly hasRequest: boolean;
  readonly hasResponse: boolean;
  readonly likelyWrite: boolean;
  readonly marked: boolean;
}

function noFilter(expect: RecordExpect | null): boolean {
  return expect === null || (expect.method === '' && expect.urlContains === '');
}

function matchesExpect(one: RecordCall, expect: RecordExpect | null): boolean {
  if (noFilter(expect)) return false;
  const want = expect as RecordExpect;
  if (want.method !== '' && one.method !== want.method) return false;
  if (want.urlContains !== '' && !one.url.includes(want.urlContains)) return false;
  return true;
}

export function listRowsOf(calls: readonly RecordCall[], expect: RecordExpect | null): readonly RecordListRow[] {
  const rows: RecordListRow[] = calls.map((one, index) => {
    const hasRequest = one.body !== '';
    const hasResponse = one.response !== '';
    const likelyWrite = one.method !== 'GET' || hasRequest;
    return {
      index,
      key: one.key,
      at: one.at,
      method: one.method,
      url: one.url,
      status: one.status,
      ct: one.ct,
      size: one.response.length === 0 ? 0 : one.response.length,
      source: one.source,
      hasRequest,
      hasResponse,
      likelyWrite,
      marked: matchesExpect(one, expect) || (noFilter(expect) && likelyWrite),
    };
  });
  return rows
    .slice()
    .sort((left, right) => Number(right.marked) - Number(left.marked) || left.at - right.at)
    .map((one, index) => ({ ...one, index }));
}

function sizeText(bytes: number): string {
  if (bytes <= 0) return '无';
  if (bytes < 1024) return `${String(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function rowTextOf(one: RecordListRow): string {
  const mark = one.marked ? ' ⭐' : '  ';
  const where = one.source === 'capture' ? '捕获' : '钩子';
  const identity = one.key === '' ? `${one.method} ${one.url}` : one.key;
  const how = one.key === '' ? '无 key' : `at ${String(one.at)}`;
  return `· [${String(one.index)}]${mark} ${identity}（${where} · 入参 ${one.hasRequest ? '有' : '无'} · 出参 ${sizeText(one.size)} · ${how}）`;
}

export interface RecordReadFacts {
  readonly phase: string;
  readonly armed: boolean;
  readonly hookCaught: number;
  readonly rows: readonly RecordListRow[];
  readonly merged: number;
  readonly capturedLines: number;
  readonly capturedInSegment: number;
  readonly capturedOutside: number;
  readonly capturedTotalLines: number;
  readonly capturedTruncated: boolean;
  readonly capturedTailLimit: number;
  readonly dropped: number;
  readonly nav: boolean;
  readonly filter: string;
  readonly captureRound: string;
  readonly shots?: number;
}

export function renderRecordRead(input: RecordReadFacts): string {
  const shots = input.shots ?? 0;
  const sep = shots > 0 ? ` · 用户已截图 ${String(shots)} 次（rec-shot-*.png）` : '';
  const faults: readonly string[] = [];
  if (!input.armed) {
    return `该页面上没有录制条（${DIY_RECORD_PREPARE_TOOL} 开始的那一场可能因页面导航失效）。先调用 ${DIY_RECORD_PREPARE_TOOL}，或让用户回到该页面后再调用 ${DIY_RECORD_READ_TOOL}。`;
  }
  if (input.phase === 'armed') return '页面尚未开始录制。等页面加载完成后再读取。';
  if (input.phase === 'recording') {
    return [
      `录制中（页面钩子已记录 ${String(input.hookCaught)} 条）。等用户按「结束录制」。${sep}`,
      ...faults,
    ].join('\n');
  }
  const marked = input.rows.filter((one) => one.marked);
  const markShown = marked.slice(0, CALLS_SHOWN);
  const restShown = input.rows
    .filter((one) => !one.marked)
    .slice(-Math.max(0, CALLS_SHOWN - markShown.length));
  const shown = [...markShown, ...restShown];
  const truncatedNote = input.capturedTruncated
    ? [
        input.capturedTotalLines > input.capturedTailLimit
          ? `（本场捕获文件共写入 ${String(input.capturedTotalLines)} 行，这里只解析最后 ${String(input.capturedTailLimit)} 行；更早的行未读取，下面的清单仅覆盖这段。）`
          : `（本场捕获文件共写入 ${String(input.capturedTotalLines)} 行，未达到 ${String(input.capturedTailLimit)} 行上限；被截断的是本次读取的输出，下面的清单仅覆盖读到的部分。）`,
      ]
    : [];
  const lines: string[] = [...truncatedNote, ...faults];
  if (input.rows.length > 0) {
    lines.push(`录制完成 · ${String(input.merged)} 条（⭐ ${String(marked.length)}）${sep}`, ...shown.map(rowTextOf));
  } else {
    lines.push(
      input.capturedTruncated
        ? `录制完成：这一段没有捕获到任何请求（页面钩子 0 条；解析到的会话捕获在该时间段内 0 条）。捕获文件被截断，详见上一行。${sep}`
        : `录制完成：这一段没有捕获到任何请求（页面钩子 0 条；会话捕获在该时间段内 0 条；两处均为 0，并非经过筛选）。` +
          `若页面刚出现就执行了保存，该操作发生在录制条注入之前，无法捕获；重新录制一段，等录制条出现后再操作。${sep}`,
    );
  }
  if (input.dropped > 0) lines.push(`（缓冲区已满，最早的 ${String(input.dropped)} 条被丢弃）`);
  if (input.captureRound === 'fail') {
    lines.push('（会话捕获最近一轮未成功，本场可能只有页面钩子。）');
  } else if (input.captureRound === '') {
    lines.push('（会话捕获尚未返回第一轮结果。稍后再读取，暂不能判定为未捕获。）');
  }
  if (input.capturedLines === 0 && !input.capturedTruncated) {
    lines.push('（会话捕获未写入任何条目，本次只有页面钩子。无法获取请求体时，让用户打开 DevTools，把该请求复制为 curl。）');
  }
  if (input.nav) lines.push('（这一段内页面发生过导航，录制条已重新注入；导航前的条目可能缺失。）');
  return lines.join('\n');
}

export interface RecordDetailFacts {
  readonly found: boolean;
  readonly where: string;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly ct: string;
  readonly at: number;
  readonly request: string;
  readonly response: string;
  readonly headers: string;
  readonly requestFullSize: number;
  readonly responseFullSize: number;
  readonly requestSizeExact: boolean;
  readonly responseSizeExact: boolean;
  readonly ambiguous: number;
  readonly source: string;
  readonly maxBytes: number;
  readonly note: string;
}

function clip(text: string, maxBytes: number): { readonly text: string; readonly cut: boolean } {
  if (maxBytes <= 0 || text.length <= maxBytes) return { text, cut: false };
  return { text: text.slice(0, maxBytes), cut: true };
}

function sizeLabel(size: number, exact: boolean): string {
  return exact ? `${String(size)} 字节` : `${String(size)} 字符（没给 body_full_size，按字符数算）`;
}

export function renderRecordDetail(input: RecordDetailFacts): string {
  if (!input.found) {
    return [
      `未找到这一条：${input.note}`,
      '可用的取法：录制进行中用清单里的 key 或 index；这一场已结束时提供 unit，读取 shots/rec-<unit>.jsonl.last；都不行时让用户打开 DevTools，把该请求复制为 curl。',
    ].join('\n');
  }
  const req = clip(input.request, input.maxBytes);
  const res = clip(input.response, input.maxBytes);
  const status = input.status === 0 ? '响应尚未返回（status 0）' : String(input.status);
  const lines = [
    `${input.method} ${input.url} · ${status}${input.ct === '' ? '' : ` · ${input.ct}`}`,
    `（${input.where} · ${new Date(input.at).toISOString()}）`,
  ];
  lines.push(
    req.text === ''
      ? '入参（request body）：无'
      : `入参（request body，原长 ${sizeLabel(input.requestFullSize, input.requestSizeExact)}${req.cut ? `，这里截到 ${String(input.maxBytes)}` : ''}）：\n${req.text}`,
  );
  lines.push(
    res.text === ''
      ? '出参（response body）：无'
      : `出参（response body，原长 ${sizeLabel(input.responseFullSize, input.responseSizeExact)}${res.cut ? `，这里截到 ${String(input.maxBytes)}` : ''}）：\n${res.text}`,
  );
  if (input.headers !== '') lines.push(`请求头（可能含凭据，不要写入 design.json）：${input.headers}`);
  if (input.ambiguous > 1) {
    lines.push(
      `（该 key 在本场原文中出现 ${String(input.ambiguous)} 次；跨轮会重名，带上清单中该行的 at 才能确定是哪一次。）`,
    );
  }
  if (input.note !== '') lines.push(`（${input.note}）`);
  return lines.join('\n');
}

export function moveOrThrow(move: RecordMove, held: RecordState | null): RecordState {
  if (move.ok) return move.state;
  throw new Error(recordRefusalText(move.code, held ?? undefined));
}

function plain(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

export function readDomainsOf(design: unknown): readonly string[] {
  const root = plain(design);
  const many = root['reads'];
  const one = root['datasource'];
  const rows = Array.isArray(many) ? many : one === undefined ? [] : [one];
  const found = new Set<string>();
  for (const row of rows) {
    const read = plain(row)['read'];
    if (typeof read !== 'string') continue;
    for (const match of read.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
      const domain = domainOf(match[0]);
      if (domain !== '') found.add(domain);
    }
  }
  return [...found];
}
