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

export function opencliHandshakeNote(report: OpencliVersionReport): {
  readonly zh: string;
  readonly en: string;
} {
  if (!report.compatible) {
    return {
      zh: `插件只认 ${report.peer}，这个版本用的是 ${report.pin} —— 换兼容的插件，或重装工作台`,
      en: `the plugin only accepts ${report.peer} but this build uses ${report.pin} — switch to a compatible plugin, or reinstall the workbench`,
    };
  }
  if (report.cli === undefined) {
    return {
      zh: `运行环境里还没有 ${report.pin} —— 重启一次 dsh；还不行就重装工作台`,
      en: `the runtime does not have ${report.pin} yet — restart dsh; if it persists, reinstall the workbench`,
    };
  }
  if (report.cli !== report.pin) {
    return {
      zh: `装的是 ${report.cli}，这个版本要 ${report.pin} —— 重启一次 dsh；还不行就重装工作台`,
      en: `installed ${report.cli} but this build needs ${report.pin} — restart dsh; if it persists, reinstall the workbench`,
    };
  }
  return {
    zh: `扩展是 ${report.extension ?? '未装'}，通道插件是 ${report.channel ?? '未装'} —— 重装一次浏览器扩展，或重启 dsh`,
    en: `extension ${report.extension ?? 'missing'}, channel plugin ${report.channel ?? 'missing'} — reinstall the browser extension, or restart dsh`,
  };
}

export function opencliHandshakeText(report: OpencliVersionReport): string {
  if (!report.compatible) {
    return `通道插件只接受 ${report.peer}，本版固定 ${report.pin}`;
  }
  if (report.cli === undefined) return `隔离运行时里还没有 ${report.pin}`;
  if (report.cli !== report.pin) return `已装 ${report.cli}，本版固定 ${report.pin}`;
  return `${report.pin} · 通道插件 ${report.channel ?? '未装'} · 扩展 ${report.extension ?? '未装'}`;
}
