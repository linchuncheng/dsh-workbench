import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { OPENCLI_PIN, OPENCLI_PIN_ENV, checkVersionRange, runtimePinOf } from '@dsh-workbench/shared/host';
import { toolchainOpencliDir, vendorPluginsDir } from '../foundation/paths.js';
import { pluginPeerProblems, type PluginPeerProblem } from './plugin-peers.js';
import { jsonAt as jsonOf, textOf } from './json-file.js';

export interface OpencliVersionReport {
  readonly pin: string;
  readonly cli?: string;
  readonly channel?: string;
  readonly peer: string;
  readonly peerProblems: readonly PluginPeerProblem[];
  readonly compatible: boolean;
}

const CHANNEL_SOURCE = new URL('../../channel/opencli-plugin.json', import.meta.url);

export function opencliChannelDir(): string {
  return join(vendorPluginsDir(), 'opencli-plugin-workbench');
}

export function opencliPeerRange(): string {
  return textOf(jsonOf(fileURLToPath(CHANNEL_SOURCE))?.['opencli']) ?? '';
}

export function opencliVersionReport(): OpencliVersionReport {
  const pin = runtimePinOf(OPENCLI_PIN, OPENCLI_PIN_ENV);
  const cli = textOf(jsonOf(join(toolchainOpencliDir(), 'package.json'))?.['version']);
  const channel = textOf(jsonOf(join(opencliChannelDir(), 'opencli-plugin.json'))?.['version']);
  const peer = opencliPeerRange();
  const peerProblems = pluginPeerProblems(pin);
  return {
    pin,
    ...(cli === undefined ? {} : { cli }),
    ...(channel === undefined ? {} : { channel }),
    peer,
    peerProblems,
    compatible: checkVersionRange(peer, pin) !== 'unsatisfied' && peerProblems.length === 0,
  };
}

export function opencliHandshakeOk(report: OpencliVersionReport): boolean {
  return report.compatible && report.cli === report.pin;
}

export function opencliHandshakeNote(report: OpencliVersionReport):
  | { readonly zh: string; readonly en: string }
  | undefined {
  if (report.peerProblems.length > 0) {
    return {
      zh: `${pluginRangesOf(report)}只适配别的运行时版本，本版是 ${report.pin} —— 插件更新后再试`,
      en: `${pluginRangesOf(report)} only accept another runtime version; this build is ${report.pin} — try again after those plugins update`,
    };
  }
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
  return undefined;
}

function pluginRangesOf(report: OpencliVersionReport): string {
  const seen = new Map<string, string[]>();
  for (const problem of report.peerProblems) {
    const names = seen.get(problem.range) ?? [];
    names.push(problem.name);
    seen.set(problem.range, names);
  }
  return [...seen.entries()]
    .map(([range, names]) => `${names.join('、')}（要 ${range}）`)
    .join('；');
}

export function opencliHandshakeText(report: OpencliVersionReport): string {
  if (report.peerProblems.length > 0) {
    return `${pluginRangesOf(report)}不认本版的 ${report.pin}`;
  }
  if (!report.compatible) {
    return `通道插件只接受 ${report.peer}，本版固定 ${report.pin}`;
  }
  if (report.cli === undefined) return `隔离运行时里还没有 ${report.pin}`;
  if (report.cli !== report.pin) return `已装 ${report.cli}，本版固定 ${report.pin}`;
  return `${report.pin} · 通道插件 ${report.channel ?? '未装'}`;
}
