import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import { toolchainArgvOf } from '@/shared/api/host/diy-surface';
import { asRecord, asText } from './diy-context';

export interface PublishRequest {
  readonly target: string;
  readonly source: string;
  readonly version: string;
  readonly license: string;
  readonly changelogNote: string;
  readonly changelogType: string;
  readonly labels: readonly string[];
  readonly category: string;
  readonly author: string;
  readonly verify: boolean;
  readonly resume: boolean;
  readonly refresh: boolean;
}

export type PublishMode = 'publish' | 'preflight';

export type PublishPreviewOf = (root: string, unit: string) => PublishPreview | null;

export type PublishAuthorHint = (root: string, unit: string) => Promise<string | undefined>;

function labelsOf(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) return [];
  const labels = value.flatMap((one) => (typeof one === 'string' ? [one.trim()] : []));
  if (labels.length !== value.length || labels.some((one) => one === '' || /[\r\n]/u.test(one))) {
    throw new Error('标签是 1–2 个短词：每项一行非空文字');
  }
  const unique = [...new Set(labels)];
  if (unique.length > 2) {
    throw new Error(`标签最多两个（收到 ${String(unique.length)} 个）；挑选最能说明模块用途的`);
  }
  return unique;
}

export function publishRequestOf(raw: unknown): PublishRequest {
  const args = asRecord(raw);
  return {
    target: asText(args['target']),
    source: asText(args['source']),
    version: asText(args['version']),
    license: asText(args['license']),
    changelogNote: asText(args['changelogNote']),
    changelogType: asText(args['changelogType']),
    labels: labelsOf(args['labels']),
    category: asText(args['category']),
    author: asText(args['author']),
    verify: args['verify'] === true,
    resume: args['resume'] === true,
    refresh: args['refresh'] === true,
  };
}

export async function publishAuthorOf(
  request: PublishRequest,
  previewOf: PublishPreviewOf,
  inferredAuthorOf: PublishAuthorHint,
  root: string,
  unit: string,
): Promise<string> {
  if (request.verify || request.target === 'local') return request.author;
  if (request.author !== '') return request.author;
  if ((previewOf(root, unit)?.author ?? '') !== '') return '';
  return (await inferredAuthorOf(root, unit)) ?? '';
}

export function releaseArgvOf(
  bin: string,
  dir: string,
  request: PublishRequest,
  author: string,
  mode: PublishMode,
): string[] {
  const argv = [...toolchainArgvOf(bin), 'release', '--cwd', dir, '--json'];
  if (mode === 'preflight') argv.push('--preflight');
  else argv.push(request.verify ? '--verify' : '--yes');
  if (request.resume) argv.push('--resume');
  if (request.target !== '') argv.push('--target', request.target);
  if (request.source !== '') argv.push('--index-source', request.source);
  if (request.version !== '') argv.push('--version', request.version);
  if (request.license !== '') argv.push('--license', request.license);
  if (author !== '') argv.push('--author', author);
  if (request.changelogNote !== '') argv.push('--changelog-note', request.changelogNote);
  if (request.changelogType !== '') argv.push('--changelog-type', request.changelogType);
  for (const label of request.labels) argv.push('--label', label);
  if (request.category !== '') argv.push('--category', request.category);
  if (request.refresh) argv.push('--refresh');
  return argv;
}
