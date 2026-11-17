import { epochOf } from '@dsh-workbench/shared/host';
import type { BrowserCaptureRow } from '@dsh-workbench/shared/host';

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function opencliJsonOf(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {}
  const open = trimmed.search(/[{[]/);
  if (open === -1) return undefined;
  const close = trimmed[open] === '[' ? trimmed.lastIndexOf(']') : trimmed.lastIndexOf('}');
  if (close <= open) return undefined;
  try {
    return JSON.parse(trimmed.slice(open, close + 1));
  } catch {
    return undefined;
  }
}

export function opencliResultOf(raw: string): unknown {
  const parsed = opencliJsonOf(raw);
  if (parsed === undefined) return undefined;
  const box = objectOf(parsed);
  if (typeof box['ok'] !== 'boolean') return parsed;
  if (!box['ok']) {
    const error = objectOf(box['error']);
    return Object.keys(error).length === 0 ? parsed : error;
  }
  if (!('data' in box)) return parsed;
  const data = box['data'];
  if (typeof data !== 'string') return data;
  const inner = opencliJsonOf(data);
  return inner === undefined ? data : inner;
}

export interface OpencliErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly help?: string;
  readonly detail?: string;
  readonly exitCode?: number;
}

const ERROR_FIELDS = ['code', 'message', 'hint', 'help', 'details', 'expected', 'actual', 'available', 'available_keys', 'candidates', 'matches_n', 'download', 'outcome', 'cause', 'exitCode', 'trace'] as const;

function extrasOf(error: Record<string, unknown>): string {
  const extra: Record<string, unknown> = {};
  for (const key of ERROR_FIELDS) {
    if (key === 'code' || key === 'message' || key === 'hint' || key === 'help') continue;
    if (key === 'exitCode') continue;
    const value = error[key];
    if (value === undefined) continue;
    extra[key] = value;
  }
  if (Object.keys(extra).length === 0) return '';
  try {
    const text = JSON.stringify(extra);
    return text.length > 1200 ? `${text.slice(0, 1200)}…` : text;
  } catch {
    return '';
  }
}

export function opencliErrorOf(raw: string): OpencliErrorEnvelope | undefined {
  const parsed = opencliJsonOf(raw);
  if (parsed === undefined) return undefined;
  const box = objectOf(parsed);
  const error = objectOf(typeof box['ok'] === 'boolean' ? box['error'] : box);
  const code = typeof error['code'] === 'string' ? error['code'] : '';
  const message = typeof error['message'] === 'string' ? error['message'] : '';
  if (code === '' && message === '') return undefined;
  const hint = error['hint'] ?? error['help'];
  const detail = extrasOf(error);
  const exitCode = typeof error['exitCode'] === 'number' ? error['exitCode'] : undefined;
  return {
    code: code === '' ? 'cli-command-failed' : code,
    message: message === '' ? code : message,
    ...(typeof hint === 'string' && hint !== '' ? { help: hint } : {}),
    ...(detail === '' ? {} : { detail }),
    ...(exitCode === undefined ? {} : { exitCode }),
  };
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return '';
}

function rowOf(value: unknown): BrowserCaptureRow | null {
  const row = objectOf(value);
  const url = row['url'];
  const method = row['method'];
  if (typeof url !== 'string' || url === '') return null;
  if (typeof method !== 'string' || method === '') return null;
  return {
    key: typeof row['key'] === 'string' ? row['key'] : '',
    at: numberOf(row['at']),
    method: method.toUpperCase(),
    url,
    status: numberOf(row['status']),
    ct: typeof row['ct'] === 'string' ? row['ct'] : '',
    size: numberOf(row['size']),
    request: typeof row['request'] === 'string' ? row['request'] : '',
    response: typeof row['response'] === 'string' ? row['response'] : '',
    requestFullSize: numberOf(row['requestFullSize']),
    responseFullSize: numberOf(row['responseFullSize']),
    requestSizeExact: row['requestSizeExact'] === true,
    responseSizeExact: row['responseSizeExact'] === true,
    headers: typeof row['headers'] === 'string' ? row['headers'] : '',
  };
}

function capturedOf(value: unknown, lineAt: number): BrowserCaptureRow | null {
  const row = objectOf(value);
  const request = objectOf(row['request']);
  const requestBody = textOf(request['body']);
  const responseBody = textOf(row['body']);
  const requestFull = numberOf(request['body_full_size']);
  const responseFull = numberOf(row['body_full_size']);
  const stamp = typeof row['timestamp'] === 'string' ? epochOf(row['timestamp']) : Number.NaN;
  return rowOf(
    {
      key: row['key'],
      at: Number.isFinite(stamp) ? stamp : lineAt,
      method: row['method'],
      url: row['url'],
      status: row['status'],
      ct: row['ct'],
      size: row['size'],
      request: requestBody,
      response: responseBody,
      requestFullSize: requestFull || requestBody.length,
      responseFullSize: responseFull || responseBody.length,
      requestSizeExact: requestFull > 0,
      responseSizeExact: responseFull > 0,
      headers: Object.keys(objectOf(request['headers'])).length === 0 ? '' : textOf(request['headers']),
    },
  );
}

function lineOf(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const box = parsed as Record<string, unknown>;
  const data = box['data'];
  if (typeof box['ok'] === 'boolean' && typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return box;
}

export function opencliBrowserCaptureOf(text: string): readonly BrowserCaptureRow[] {
  const out: BrowserCaptureRow[] = [];
  for (const line of text.split('\n')) {
    const row = lineOf(line);
    if (row === null) continue;
    const lineAt = typeof row['captured_at'] === 'string' ? epochOf(row['captured_at']) : Number.NaN;
    const inside = row['entries'];
    if (Array.isArray(inside)) {
      for (const one of inside) {
        const mapped = capturedOf(one, lineAt);
        if (mapped !== null) out.push(mapped);
      }
      continue;
    }
    const own = rowOf(row);
    if (own !== null && own.at > 0) {
      out.push(own);
      continue;
    }
    const mapped = capturedOf(row, lineAt);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

export function opencliCaptureLinesOf(rows: readonly BrowserCaptureRow[]): string {
  return rows.map((one) => JSON.stringify(one)).join('\n');
}
