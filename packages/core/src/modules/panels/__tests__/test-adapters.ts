import type { BrowserCaptureRow, RuntimeCommandSurface, WorkbenchAdapters } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { createFakeDataReader, fakeAdapterSet } from '@dsh-workbench/shared/testing';
import { fsSupply } from './fs-supply';

const base = fakeAdapterSet();

export function commandResultOf(stdout: string): unknown {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return parsed;
  const box = parsed as Record<string, unknown>;
  if (typeof box['ok'] !== 'boolean') return parsed;
  if (!box['ok']) return { error: box['error'] };
  const data = box['data'];
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function objectOfRow(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function textOfRow(value: unknown): string {
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

function numberOfRow(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function rowOf(value: unknown, lineAt: number): BrowserCaptureRow | null {
  const row = objectOfRow(value);
  const url = row['url'];
  const method = row['method'];
  if (typeof url !== 'string' || url === '' || typeof method !== 'string' || method === '') return null;
  const stamp = typeof row['timestamp'] === 'string' ? Date.parse(row['timestamp']) : Number.NaN;
  const request = objectOfRow(row['request']);
  const requestBody = textOfRow(request['body']);
  const responseBody = textOfRow(row['body']);
  return {
    key: typeof row['key'] === 'string' ? row['key'] : '',
    at: Number.isFinite(stamp) ? stamp : Number.isFinite(lineAt) ? lineAt : 0,
    method: method.toUpperCase(),
    url,
    status: numberOfRow(row['status']),
    ct: typeof row['ct'] === 'string' ? row['ct'] : '',
    size: numberOfRow(row['size']),
    request: requestBody,
    response: responseBody,
    requestFullSize: numberOfRow(request['body_full_size']) || requestBody.length,
    responseFullSize: numberOfRow(row['body_full_size']) || responseBody.length,
    requestSizeExact: numberOfRow(request['body_full_size']) > 0,
    responseSizeExact: numberOfRow(row['body_full_size']) > 0,
    headers: Object.keys(objectOfRow(request['headers'])).length === 0 ? '' : textOfRow(request['headers']),
  };
}

export function captureRowsOf(text: string): readonly BrowserCaptureRow[] {
  const out: BrowserCaptureRow[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const box = parsed as Record<string, unknown>;
    const data = box['data'];
    const row = typeof box['ok'] === 'boolean' && typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)
      : box;
    const lineAt = typeof row['captured_at'] === 'string' ? Date.parse(row['captured_at']) : Number.NaN;
    const inside = row['entries'];
    if (Array.isArray(inside)) {
      for (const one of inside) {
        const mapped = rowOf(one, lineAt);
        if (mapped !== null) out.push(mapped);
      }
      continue;
    }
    const own = rowOf(row, lineAt);
    if (own !== null) out.push(own);
  }
  return out;
}

export const opencliSurface: RuntimeCommandSurface = {
  name: 'opencli',
  pluginPrefix: 'opencli-plugin-',
  invoke: (site, command) => (command === undefined || command === '' ? `opencli ${site}` : `opencli ${site} ${command}`),
  help: (site) => `opencli ${site} --help`,
  authorHint: 'opencli skills read opencli-adapter-author',
  background: (command, argv) => [quoteShellArg(command), ...argv.map(quoteShellArg)].join(' '),
  commandResult: (stdout) => commandResultOf(stdout),
  browserCapture: (text) => captureRowsOf(text),
};

export function testAdaptersWith(paths: {
  readonly root: () => string;
  readonly profile: () => string;
  readonly catalog?: () => string | undefined;
  readonly plugins?: () => string | undefined;
  readonly surface?: RuntimeCommandSurface | null;
  readonly cliDirs?: boolean | undefined;
}): WorkbenchAdapters {
  const surface = paths.surface === undefined ? opencliSurface : paths.surface;
  const supply = fsSupply({
    root: paths.root,
    profile: paths.profile,
    catalog: paths.catalog ?? (() => undefined),
    plugins: paths.plugins ?? (() => undefined),
    ...(paths.cliDirs === undefined ? {} : { cliDirs: paths.cliDirs }),
  });
  return {
    ...base,
    data: createFakeDataReader(),
    supply,
    modules: supply,
    runtime: {
      ...base.runtime,
      capabilities: () => ({ console: true, pluginMarket: true, browserBridge: true }),
      ...(surface === null ? { commandSurface: () => undefined } : { commandSurface: () => surface }),
    },
  };
}
