import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import { join } from 'node:path';
import type { DiagRecorder, DiagReadResult, RouteHandler } from '@dsh-workbench/shared/host';
import { createDiagFileSink, createDiagRecorder, now } from '@dsh-workbench/shared/host';
import { DIAG_AREAS, DIAG_CLASSES, diagMatches, param } from '@dsh-workbench/shared/host';
import type { DiagArea, DiagClass } from '@dsh-workbench/shared/host';
dayjs.extend(utc);

export const DIAG_RECORDS_ROUTE = 'diag/records';

export const DIAG_LIMIT_DEFAULT = 100;
export const DIAG_LIMIT_MAX = 500;

export interface DiagRoutesDeps {
  readonly recorder: DiagRecorder;
  readonly readDisk?: ((day: string) => DiagReadResult) | undefined;
  readonly clock?: (() => number) | undefined;
}

interface DiagQuery {
  readonly since?: number;
  readonly until?: number;
  readonly area?: DiagArea;
  readonly class?: DiagClass;
  readonly code?: string;
  readonly limit: number;
  readonly source: 'memory' | 'disk';
}

function badRequest(message: string): { readonly ok: false; readonly error: { readonly code: string; readonly message: string } } {
  return { ok: false, error: { code: 'bad-request', message } };
}

function numberParam(raw: string | undefined): number | undefined | 'bad' {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 'bad';
}

function queryOf(search: URLSearchParams): DiagQuery | string {
  const since = numberParam(param(search, 'since'));
  if (since === 'bad') return 'since 必须是毫秒时间戳';
  const until = numberParam(param(search, 'until'));
  if (until === 'bad') return 'until 必须是毫秒时间戳';
  const area = param(search, 'area');
  if (area !== undefined && !(DIAG_AREAS as readonly string[]).includes(area)) {
    return `area 只能是 ${DIAG_AREAS.join(' / ')}`;
  }
  const kind = param(search, 'class');
  if (kind !== undefined && !(DIAG_CLASSES as readonly string[]).includes(kind)) {
    return `class 只能是 ${DIAG_CLASSES.join(' / ')}`;
  }
  const limitRaw = numberParam(param(search, 'limit'));
  if (limitRaw === 'bad') return 'limit 必须是数字';
  const limit = Math.min(Math.max(1, Math.floor(limitRaw ?? DIAG_LIMIT_DEFAULT)), DIAG_LIMIT_MAX);
  const source = param(search, 'source');
  if (source !== undefined && source !== 'memory' && source !== 'disk') return 'source 只能是 memory / disk';
  const code = param(search, 'code');
  return {
    ...(since === undefined ? {} : { since }),
    ...(until === undefined ? {} : { until }),
    ...(area === undefined ? {} : { area: area as DiagArea }),
    ...(kind === undefined ? {} : { class: kind as DiagClass }),
    ...(code === undefined ? {} : { code }),
    limit,
    source: source === 'disk' ? 'disk' : 'memory',
  };
}

export function diagRecordsHandler(deps: DiagRoutesDeps): RouteHandler {
  const clock = deps.clock ?? now;
  return (search) => {
    const query = queryOf(search);
    if (typeof query === 'string') {
      deps.recorder.record({ code: 'DIAG_BAD_PARAM', cause: { message: query } });
      return badRequest(query);
    }
    if (query.source === 'disk' && deps.readDisk === undefined) {
      deps.recorder.record({ code: 'DIAG_BAD_PARAM', cause: { message: '这份宿主没有接落盘读回' } });
      return badRequest('这份宿主没有接落盘读回，只能用 source=memory');
    }
    const all =
      query.source === 'disk'
        ? (deps.readDisk as (day: string) => DiagReadResult)(dayjs(clock()).utc().format('YYYY-MM-DD')).records
        : deps.recorder.recent();
    const hit = all.filter((one) => diagMatches(one, query));
    const records = hit.slice(Math.max(0, hit.length - query.limit));
    return { ok: true, records, total: hit.length, truncated: hit.length > records.length };
  };
}

export function diagRoutesOf(root: string): DiagRoutesDeps {
  const files = createDiagFileSink({ dir: join(root, 'diagnostics', 'records') });
  return {
    recorder: createDiagRecorder({ sinks: [files.sink] }),
    readDisk: (day) => files.readDay(day),
  };
}
