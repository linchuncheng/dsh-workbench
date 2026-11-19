import type { RecordCall, RecordSnapRead } from './diy-record-text';

export interface WriteCandidate {
  readonly call: RecordCall;
  readonly score: number;
  readonly why: readonly string[];
}

export interface MaterialsRead {
  readonly writes: readonly RecordCall[];
  readonly candidates: readonly WriteCandidate[];
  readonly hasRequest: boolean;
  readonly hasResponse: boolean;
  readonly snap: RecordSnapRead | null;
  readonly missing: readonly string[];
}

export interface MaterialsExpect {
  readonly method: string;
  readonly urlContains: string;
}

const WRITE_WORDS = [
  'save',
  'create',
  'add',
  'insert',
  'update',
  'edit',
  'modify',
  'submit',
  'publish',
  'delete',
  'remove',
  'approve',
  'audit',
  'import',
  'upload',
  'batch',
  'transfer',
  'set',
  'apply',
  'confirm',
  'change',
];
const READ_WORDS = ['list', 'query', 'search', 'page', 'detail', 'find', 'load', 'count', 'summary', 'tree', 'options'];
const PAGING_KEYS = ['page', 'pageNo', 'pageNum', 'pageSize', 'size', 'limit', 'offset', 'current', 'sort', 'order', 'keyword', 'q', 'total'];
const WRITE_FLOOR = 5;

const pathOf = (url: string): string => {
  const at = url.indexOf('://');
  const rest = at < 0 ? url : url.slice(at + 3);
  const slash = rest.indexOf('/');
  return slash < 0 ? rest : rest.slice(slash);
};

const hitsOf = (text: string, words: readonly string[]): readonly string[] =>
  words.filter((one) => new RegExp(`(^|[^a-z])${one}($|[^a-z])`, 'i').test(text));

const bodyBoxOf = (body: string): Record<string, unknown> | null => {
  const trimmed = body.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const pagingOnlyOf = (body: string): boolean => {
  const box = bodyBoxOf(body);
  if (box === null) return false;
  const keys = Object.keys(box);
  return keys.length > 0 && keys.every((one) => PAGING_KEYS.includes(one));
};

const looksWrittenOf = (response: string): boolean => {
  const trimmed = response.trim();
  if (trimmed === '') return false;
  if (/"id"\s*:\s*("?[0-9a-z-]{1,}"?)/i.test(trimmed)) return true;
  return /"code"\s*:\s*0\b/.test(trimmed) || /"success"\s*:\s*true\b/.test(trimmed);
};

const matchedExpectOf = (call: RecordCall, expect: MaterialsExpect | null): boolean => {
  if (expect === null) return false;
  const method = expect.method.trim().toUpperCase();
  if (method !== '' && call.method.toUpperCase() !== method) return false;
  const needle = expect.urlContains.trim();
  if (needle !== '' && !call.url.includes(needle)) return false;
  return method !== '' || needle !== '';
};

export function candidatesOf(calls: readonly RecordCall[], expect: MaterialsExpect | null = null): readonly WriteCandidate[] {
  const rows: WriteCandidate[] = [];
  for (const call of calls) {
    const path = pathOf(call.url);
    const why: string[] = [];
    let score = call.method.toUpperCase() === 'GET' || call.method.toUpperCase() === 'HEAD' ? -5 : 2;
    const writes = hitsOf(path, WRITE_WORDS);
    const reads = hitsOf(path, READ_WORDS);
    if (writes.length > 0) {
      score += 4;
      why.push(`路径含写操作词（${writes.join('/')}）`);
    }
    if (reads.length > 0) {
      score -= 4;
      why.push(`路径含读操作词（${reads.join('/')}）`);
    }
    if (call.body.trim() !== '') {
      if (pagingOnlyOf(call.body)) {
        score -= 3;
        why.push('请求体只有分页字段');
      } else {
        score += 3;
        why.push('有请求体');
      }
    }
    if (looksWrittenOf(call.response)) {
      score += 2;
      why.push('响应符合写入成功');
    }
    if (matchedExpectOf(call, expect)) {
      score += 10;
      why.push('与本次指定的目标匹配');
    }
    rows.push({ call, score, why });
  }
  return rows.sort((left, right) => right.score - left.score);
}

export function materialsOf(
  calls: readonly RecordCall[],
  snap: RecordSnapRead | null,
  expect: MaterialsExpect | null = null,
): MaterialsRead {
  const candidates = candidatesOf(calls, expect);
  const writes = candidates.filter((one) => one.score >= WRITE_FLOOR).map((one) => one.call);
  const hasRequest = writes.some((one) => one.body.trim() !== '');
  const hasResponse = writes.some((one) => one.response.trim() !== '' && one.status < 400);
  const required = snap === null ? 0 : snap.required.length;
  const missing: string[] = [];
  if (writes.length === 0) missing.push('写请求');
  if (writes.length > 0 && !hasRequest) missing.push('入参');
  if (writes.length > 0 && !hasResponse) missing.push('出参');
  if (snap === null || snap.fields === 0 || required === 0) missing.push('必填信息');
  return { writes, candidates, hasRequest, hasResponse, snap, missing };
}

export function materialsTextOf(read: MaterialsRead): readonly string[] {
  const lines: string[] = [];
  if (read.writes.length === 0) {
    lines.push('材料：未识别到写请求。若本场有保存操作，指明是哪一条（prepare 时提供 urlContains 最可靠）。');
  } else {
    const head = read.writes
      .slice(0, 3)
      .map((one) => `${one.method} ${pathOf(one.url)}`)
      .join(' / ');
    const more = read.writes.length > 3 ? ` 等 ${String(read.writes.length)} 条` : '';
    lines.push(
      `材料：写请求 ${String(read.writes.length)} 条（${head}${more} · 入参 ${read.hasRequest ? '有' : '无'} · 出参 ${read.hasResponse ? '有' : '无'}）`,
    );
    const others = read.candidates.filter((one) => one.score < WRITE_FLOOR).slice(0, 2);
    for (const one of others) {
      lines.push(`· 未计为写：${one.call.method} ${pathOf(one.call.url)}（${one.why.join(' · ')}）`);
    }
  }
  const snap = read.snap;
  if (snap === null) {
    lines.push('表单快照：无。需要必填字段信息时，让用户对表单截图。');
  } else if (snap.fields === 0) {
    lines.push('表单快照：已获取，但无法识别字段。让用户对表单截图。');
  } else {
    const names = snap.required.length === 0 ? '未标出必填' : `必填 ${String(snap.required.length)}（${snap.required.join(' / ')}）`;
    const tail = snap.truncated ? '· HTML 被截断，细节以截图为准' : '· 原始 HTML 已保存';
    lines.push(`表单快照：${String(snap.fields)} 个字段，${names} ${tail}`);
  }
  if (read.missing.length > 0) {
    lines.push(`还缺：${read.missing.join(' / ')}。先补齐这些，再写 design.json。`);
  }
  return lines;
}
