import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { OPENCLI_PIN, OPENCLI_PIN_ENV, checkVersionRange, runtimePinOf } from '@dsh-workbench/shared/host';
import { toolchainOpencliDir, vendorPluginsDir } from '../foundation/paths.js';
import { toolchainDir } from './opencli-runtime.js';

export interface OpencliVersionReport {
  readonly pin: string;
  readonly cli?: string;
  readonly channel?: string;
  readonly extension?: string;
  readonly peer: string;
  readonly compatible: boolean;
}

const CHANNEL_SOURCE = new URL('../../channel/opencli-plugin.json', import.meta.url);

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function jsonOf(file: string): Readonly<Record<string, unknown>> | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Readonly<Record<string, unknown>>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function opencliChannelDir(): string {
  return join(vendorPluginsDir(), 'opencli-plugin-workbench');
}

export function opencliPeerRange(): string {
  return textOf(jsonOf(fileURLToPath(CHANNEL_SOURCE))?.['opencli']) ?? '';
}

export function opencliExtensionDir(): string {
  return join(toolchainDir(), '..', 'extension');
}

export function opencliVersionReport(): OpencliVersionReport {
  const pin = runtimePinOf(OPENCLI_PIN, OPENCLI_PIN_ENV);
  const cli = textOf(jsonOf(join(toolchainOpencliDir(), 'package.json'))?.['version']);
  const channel = textOf(jsonOf(join(opencliChannelDir(), 'opencli-plugin.json'))?.['version']);
  const extension = textOf(jsonOf(join(opencliExtensionDir(), 'manifest.json'))?.['version']);
  const peer = opencliPeerRange();
  return {
    pin,
    ...(cli === undefined ? {} : { cli }),
    ...(channel === undefined ? {} : { channel }),
    ...(extension === undefined ? {} : { extension }),
    peer,
    compatible: checkVersionRange(peer, pin) !== 'unsatisfied',
  };
}

export function opencliHandshakeOk(report: OpencliVersionReport): boolean {
  return report.compatible && report.cli === report.pin;
}

export function opencliHandshakeText(report: OpencliVersionReport): string {
  if (!report.compatible) {
    return `公共通道的插件只认 ${report.peer}，而钉的是 ${report.pin}：换兼容的插件或换回兼容的运行时`;
  }
  if (report.cli === undefined) return `隔离运行时里还没有 ${report.pin}`;
  if (report.cli !== report.pin) return `盘上是 ${report.cli}，钉的是 ${report.pin}`;
  return `${report.pin} · 公共通道 ${report.channel ?? '未装'} · 扩展 ${report.extension ?? '未装'}`;
}
