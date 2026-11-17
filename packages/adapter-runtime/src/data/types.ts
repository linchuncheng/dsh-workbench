import { BROWSER_READ_SESSION, type Seam } from '@dsh-workbench/shared/host';
import type { QueueWaitEvent } from './queue.js';

export interface SaveBytesInput {
  readonly data: Uint8Array;
  readonly contentType: string;
  readonly name: string;
}

export type SaveBytes = (input: SaveBytesInput) => Promise<unknown>;

export interface DataReaderOptions {
  readonly seam?: Seam | undefined;
  readonly command?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly channel?: boolean | undefined;
  readonly channelInstalled?: (() => boolean) | undefined;
  readonly queueWaitMs?: number | undefined;
  readonly readSessions?: number | undefined;
  readonly onQueue?: ((event: QueueWaitEvent) => void) | undefined;
  readonly saveBytes?: SaveBytes | undefined;
}

export function sessionOf(value: string | undefined): string {
  return value === undefined || value === '' ? BROWSER_READ_SESSION : value;
}

const HOST_RE = /^[a-z0-9-]+$/;

function hostKeyOf(url: string | undefined): string | undefined {
  if (url === undefined || url.trim() === '') return undefined;
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
  if (host === '') return undefined;
  const key = host.replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '');
  return HOST_RE.test(key) ? key : undefined;
}

export function readSessionOf(value: string | undefined, url: string | undefined): string {
  if (value !== undefined && value !== '') return value;
  const host = hostKeyOf(url);
  return host === undefined ? BROWSER_READ_SESSION : `${BROWSER_READ_SESSION}-${host}`;
}
